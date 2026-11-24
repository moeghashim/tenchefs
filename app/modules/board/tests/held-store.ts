import type { BoardStore, ChannelMessagesState, ThreadMessagesState } from "../index.ts";
import type { ChannelName, CookoutClient, IdentityName, Message, Reply, TopLevelMessage } from "../../sdk/index.ts";
import { channelPage, createBoardStore, threadOf } from "../index.ts";
import { onTestFinished, vi } from "vitest";
import type { HandLive } from "../../testing/web.ts";
import { createCookoutClient } from "../../sdk/index.ts";
import { createLive } from "../../live/index.ts";
import { handLive } from "../../testing/web.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

interface Opened {
  readonly store: BoardStore;
  readonly hand: HandLive;
}

interface Human {
  readonly name: IdentityName;
  readonly client: CookoutClient;
}

type Loaded<State> = Extract<State, { readonly status: "loaded" }>;

type ChannelLoaded = Loaded<ChannelMessagesState>;

type ThreadLoaded = Loaded<ThreadMessagesState>;

const PAGE_SIZE = 50;

function adminClient(): CookoutClient {
  return createCookoutClient({ env: {}, token: webTestCookout().adminToken, url: webTestCookout().url });
}

async function humanIn(channel: string): Promise<Human> {
  const { identity, token } = await adminClient().createIdentity({ kind: "human", name: `${channel}-bob` });
  return { client: createCookoutClient({ env: {}, token, url: webTestCookout().url }), name: identity.name };
}

async function postedIn(channel: string): Promise<TopLevelMessage> {
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: "Ship it?" });
  if (message.kind !== "top-level") {
    throw new Error("A message posted without replyTo is top-level.");
  }
  return message;
}

interface Replying {
  readonly parent: TopLevelMessage;
  readonly client?: CookoutClient;
}

async function repliedTo({ client = adminClient(), parent }: Replying): Promise<Reply> {
  const { message } = await client.createMessage({ channel: parent.channel, replyTo: parent.id, text: "Shipped." });
  if (message.kind !== "reply") {
    throw new Error("A message posted with replyTo is a reply.");
  }
  return message;
}

interface Opening {
  readonly client?: CookoutClient;
  readonly pageSize?: number;
}

function opened({ client = adminClient(), pageSize = PAGE_SIZE }: Opening = {}): Opened {
  const hand = handLive();
  const store = createBoardStore({ client, live: createLive(hand.adapter), pageSize, url: webTestCookout().url });
  return { hand, store };
}

function shown(unsubscribe: () => void): void {
  onTestFinished(unsubscribe);
}

interface ChannelShowing {
  readonly store: BoardStore;
  readonly channel: ChannelName;
}

async function channelShown({ channel, store }: ChannelShowing): Promise<() => ChannelLoaded> {
  const select = channelPage(channel);
  shown(store.channelPages.subscribeShowing(channel)(vi.fn<() => void>()));
  function read(): ChannelLoaded {
    const state = select(store.snapshot());
    if (state.status !== "loaded") {
      throw new Error(`The channel is ${state.status}.`);
    }
    return state;
  }
  await vi.waitFor(read);
  return read;
}

interface ThreadShowing {
  readonly store: BoardStore;
  readonly parent: Message;
}

async function threadShown({ parent, store }: ThreadShowing): Promise<() => ThreadLoaded> {
  const place = { channel: parent.channel, id: parent.id };
  const select = threadOf(place);
  shown(store.threads.subscribeShowing(place, true)(vi.fn<() => void>()));
  function read(): ThreadLoaded {
    const state = select(store.snapshot());
    if (state.status !== "loaded") {
      throw new Error(`The thread is ${state.status}.`);
    }
    return state;
  }
  await vi.waitFor(read);
  return read;
}

interface Both extends Opened {
  readonly page: () => ChannelLoaded;
  readonly thread: () => ThreadLoaded;
}

interface BothShowing {
  readonly parent: TopLevelMessage;
  readonly pageSize?: number;
}

async function bothShown({ pageSize = PAGE_SIZE, parent }: BothShowing): Promise<Both> {
  const { hand, store } = opened({ pageSize });
  const [page, thread] = await Promise.all([
    channelShown({ channel: parent.channel, store }),
    threadShown({ parent, store }),
  ]);
  return { hand, page, store, thread };
}

interface CountedReads {
  readonly client: CookoutClient;
  readonly reads: readonly string[];
}

function countingReads(): CountedReads {
  const admin = adminClient();
  const reads: string[] = [];
  return {
    client: {
      ...admin,
      listMessages: async (channel, query) => {
        reads.push(channel);
        const answer = await admin.listMessages(channel, query);
        return answer;
      },
    },
    reads,
  };
}

function bounce(hand: HandLive): void {
  hand.report("down");
  hand.report("up");
}

function idsOf(messages: readonly Message[]): readonly number[] {
  return messages.map((message) => message.id);
}

export {
  adminClient,
  bothShown,
  bounce,
  type ChannelLoaded,
  channelShown,
  countingReads,
  humanIn,
  idsOf,
  type Opened,
  opened,
  postedIn,
  repliedTo,
  shown,
  type ThreadLoaded,
};
