import type { ChannelName, CookoutClient, MessageId, ThreadResponse } from "../../sdk/index.ts";
import { withEntry, withFresh } from "./messages-table.ts";
import type { Held } from "./messages-held.ts";
import { LOADING } from "./message-states.ts";
import type { MessagesHeld } from "./messages-table.ts";
import type { ThreadLoaded } from "./message-states.ts";
import { failure } from "./failure.ts";

type ThreadsClient = Pick<CookoutClient, "ack" | "createMessage" | "getThread">;

interface ThreadAt {
  readonly held: Held;
  readonly client: ThreadsClient;
  readonly channel: ChannelName;
  readonly id: MessageId;
  readonly key: string;
  readonly acking: () => boolean;
}

interface ReplyRequest {
  readonly text: string;
  readonly posted: () => void;
}

type ThreadChange = (thread: ThreadLoaded, read: ThreadResponse) => ThreadLoaded;

interface ThreadOps {
  readonly ack: (id: MessageId) => Promise<void>;
  readonly reload: () => Promise<void>;
  readonly reply: (request: ReplyRequest) => Promise<void>;
}

function loadedIn(held: MessagesHeld, key: string): ThreadLoaded | null {
  const thread = held.threads.get(key) ?? LOADING;
  if (thread.status !== "loaded") {
    return null;
  }
  return thread;
}

function updateThread(at: ThreadAt, change: (thread: ThreadLoaded) => ThreadLoaded): void {
  const held = at.held.current();
  const thread = loadedIn(held, at.key);
  if (thread !== null) {
    at.held.put({ ...held, threads: withEntry({ key: at.key, map: held.threads, value: change(thread) }) });
  }
}

function latestOf({ parent, replies }: ThreadResponse): MessageId {
  let latest = parent.id;
  for (const reply of replies) {
    latest = reply.id;
  }
  return latest;
}

function firstRead(read: ThreadResponse): ThreadLoaded {
  return {
    parent: read.parent.id,
    read: { status: "none" },
    replies: read.replies.map((reply) => reply.id),
    reply: { status: "idle" },
    status: "loaded",
  };
}

async function readThread(at: ThreadAt, change: ThreadChange): Promise<ThreadResponse> {
  const read = await at.held.readInto({
    change: (held, answer) => {
      const fresh = withFresh({
        fresh: { messages: [answer.parent, ...answer.replies], receipts: answer.receipts },
        held,
      });
      const thread = loadedIn(fresh, at.key) ?? firstRead(answer);
      return { ...fresh, threads: withEntry({ key: at.key, map: fresh.threads, value: change(thread, answer) }) };
    },
    request: async () => {
      const answer = await at.client.getThread(at.id);
      return answer;
    },
  });
  return read;
}

function withRead(thread: ThreadLoaded, read: ThreadResponse): ThreadLoaded {
  return { ...thread, parent: read.parent.id, replies: read.replies.map((reply) => reply.id) };
}

function repliedRead(thread: ThreadLoaded, read: ThreadResponse): ThreadLoaded {
  return { ...withRead(thread, read), reply: { status: "idle" } };
}

async function ackThread(at: ThreadAt, id: MessageId): Promise<void> {
  updateThread(at, (thread) => ({ ...thread, read: { status: "acking" } }));
  try {
    const { readPosition } = await at.client.ack(id);
    updateThread(at, (thread) => ({ ...thread, read: { readPosition, status: "acked" } }));
  } catch (error: unknown) {
    updateThread(at, (thread) => ({ ...thread, read: failure(error) }));
  }
}

async function ackIfAcking(at: ThreadAt, read: ThreadResponse): Promise<void> {
  if (at.acking()) {
    await ackThread(at, latestOf(read));
  }
}

async function loadThread(at: ThreadAt): Promise<void> {
  try {
    const read = await readThread(at, withRead);
    await ackIfAcking(at, read);
  } catch (error: unknown) {
    const held = at.held.current();
    at.held.put({ ...held, threads: withEntry({ key: at.key, map: held.threads, value: failure(error) }) });
  }
}

async function reloadThread(at: ThreadAt): Promise<void> {
  if (loadedIn(at.held.current(), at.key) === null) {
    await loadThread(at);
    return;
  }
  try {
    const read = await readThread(at, withRead);
    await ackIfAcking(at, read);
  } catch (error: unknown) {
    updateThread(at, (thread) => ({ ...thread, read: failure(error) }));
  }
}

async function postReply(at: ThreadAt, { posted, text }: ReplyRequest): Promise<void> {
  updateThread(at, (thread) => ({ ...thread, reply: { status: "posting" } }));
  try {
    await at.client.createMessage({ channel: at.channel, replyTo: at.id, text });
    await readThread(at, repliedRead);
    posted();
  } catch (error: unknown) {
    updateThread(at, (thread) => ({ ...thread, reply: failure(error) }));
  }
}

function threadOps(at: ThreadAt): ThreadOps {
  return {
    ack: async (id) => {
      await ackThread(at, id);
    },
    reload: async () => {
      await reloadThread(at);
    },
    reply: async (request) => {
      await postReply(at, request);
    },
  };
}

export { type ReplyRequest, type ThreadOps, type ThreadsClient, threadOps };
