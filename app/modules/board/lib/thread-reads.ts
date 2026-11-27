import type { ChannelName, CookoutClient, JsonValue, MessageId, ThreadResponse } from "../../sdk/index.ts";
import { NOTHING_DELETED, withDeletedKept } from "./message-deletions.ts";
import { callFailure, notJson, parseData } from "./webhook-command-call.ts";
import { withEntry, withFresh } from "./messages-table.ts";
import type { CallRequest } from "./webhook-command-call.ts";
import type { Held } from "./messages-held.ts";
import { LOADING } from "./message-states.ts";
import type { MessagesHeld } from "./messages-table.ts";
import type { Outgoing } from "./outgoing.ts";
import type { ThreadLoaded } from "./message-states.ts";
import { attachmentsOf } from "./outgoing.ts";
import { failure } from "./failure.ts";

type ThreadsClient = Pick<CookoutClient, "ack" | "callCommand" | "createMessage" | "getThread">;

interface ThreadAt {
  readonly held: Held;
  readonly client: ThreadsClient;
  readonly channel: ChannelName;
  readonly id: MessageId;
  readonly key: string;
  readonly acking: () => boolean;
}

interface ReplyRequest extends Outgoing {
  readonly posted: () => void;
}

type ThreadChange = (thread: ThreadLoaded, read: ThreadResponse) => ThreadLoaded;

interface ThreadOps {
  readonly ack: (id: MessageId) => Promise<void>;
  readonly reload: () => Promise<void>;
  readonly reply: (request: ReplyRequest) => Promise<void>;
  readonly call: (request: CallRequest) => Promise<void>;
  readonly editCallData: (callData: string) => void;
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
    call: { status: "idle" },
    callData: "",
    deleted: NOTHING_DELETED,
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
  const replies = read.replies.map((reply) => reply.id);
  return {
    ...thread,
    parent: read.parent.id,
    replies: withDeletedKept({ before: thread.replies, deleted: thread.deleted, read: replies }),
  };
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

async function postReply(at: ThreadAt, { files, posted, text }: ReplyRequest): Promise<void> {
  updateThread(at, (thread) => ({ ...thread, reply: { status: "posting" } }));
  try {
    const attachments = await attachmentsOf(files);
    await at.client.createMessage({ attachments, channel: at.channel, replyTo: at.id, text });
    await readThread(at, repliedRead);
    posted();
  } catch (error: unknown) {
    updateThread(at, (thread) => ({ ...thread, reply: failure(error) }));
  }
}

function tellRefused({ refused }: CallRequest): void {
  if (refused !== null) {
    refused();
  }
}

interface ThreadCall {
  readonly data: JsonValue;
  readonly request: CallRequest;
}

async function sendCall(at: ThreadAt, { data, request }: ThreadCall): Promise<void> {
  const { webhookCommand } = request;
  updateThread(at, (thread) => ({ ...thread, call: { status: "calling", webhookCommand } }));
  try {
    await at.client.callCommand(webhookCommand, { channel: at.channel, data, replyTo: at.id });
    await readThread(at, (thread, read) => ({
      ...withRead(thread, read),
      call: { status: "called", webhookCommand },
      callData: "",
    }));
    request.called();
  } catch (error: unknown) {
    updateThread(at, (thread) => ({ ...thread, call: callFailure({ error, webhookCommand }) }));
    tellRefused(request);
  }
}

async function callInThread(at: ThreadAt, request: CallRequest): Promise<void> {
  const parsed = parseData(request.data);
  if (parsed.status === "not-json") {
    updateThread(at, (thread) => ({ ...thread, call: notJson(request.webhookCommand) }));
    tellRefused(request);
    return;
  }
  await sendCall(at, { data: parsed.data, request });
}

function threadOps(at: ThreadAt): ThreadOps {
  return {
    ack: async (id) => {
      await ackThread(at, id);
    },
    call: async (request) => {
      await callInThread(at, request);
    },
    editCallData: (callData) => {
      updateThread(at, (thread) => ({ ...thread, callData }));
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
