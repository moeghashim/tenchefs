import type { BoardState, BoardStore } from "../index.ts";
import type { Channel, CookoutClient, CookoutEvent, InboxItem, Message, TopLevelMessage } from "../../sdk/index.ts";
import { adminClient, humanIn, shown } from "./held-store.ts";
import { createBoardStore, earlierOf, inboxOf } from "../index.ts";
import type { HandLive } from "../../testing/web.ts";
import { createLive } from "../../live/index.ts";
import { handLive } from "../../testing/web.ts";
import { parseEvent } from "../../sdk/index.ts";
import { vi } from "vitest";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

const ONE = 1;

interface Reads {
  readonly inbox: number;
  readonly history: number;
}

interface Watching {
  readonly store: BoardStore;
  readonly hand: HandLive;
  readonly reader: CookoutClient;
  readonly reads: () => Reads;
}

interface Counted {
  readonly client: CookoutClient;
  readonly reads: () => Reads;
}

function counting(reader: CookoutClient): Counted {
  let inbox = 0;
  let history = 0;
  const client: CookoutClient = {
    ...reader,
    inbox: async () => {
      inbox += ONE;
      const answer = await reader.inbox();
      return answer;
    },
    inboxHistory: async (query) => {
      history += ONE;
      const answer = await reader.inboxHistory(query);
      return answer;
    },
  };
  return { client, reads: () => ({ history, inbox }) };
}

interface Subscribed {
  readonly reader: CookoutClient;
  readonly channel: Channel;
}

async function subscribedIn(name: string): Promise<Subscribed> {
  const { channel } = await adminClient().createChannel({ name });
  const { client } = await humanIn(name);
  await client.subscribe(name);
  return { channel, reader: client };
}

async function posted(channel: string): Promise<Message> {
  const { message } = await adminClient().createMessage({ channel, text: "Ship it?" });
  return message;
}

function topLevel(message: Message): TopLevelMessage {
  if (message.kind !== "top-level") {
    throw new Error("A message posted without replyTo is top-level.");
  }
  return message;
}

type Loaded<State> = Extract<State, { readonly status: "loaded" }>;

function loadedInbox(state: BoardState): Loaded<ReturnType<typeof inboxOf>> {
  const inbox = inboxOf(state);
  if (inbox.status !== "loaded") {
    throw new Error(`The inbox is ${inbox.status}.`);
  }
  return inbox;
}

function loadedEarlier(state: BoardState): Loaded<ReturnType<typeof earlierOf>> {
  const earlier = earlierOf(state);
  if (earlier.status !== "loaded") {
    throw new Error(`Earlier is ${earlier.status}.`);
  }
  return earlier;
}

function itemIds(store: BoardStore): readonly number[] {
  const { items } = loadedInbox(store.snapshot());
  return items.map((item) => item.message.id);
}

function earlierIds(store: BoardStore): readonly number[] {
  const { items } = loadedEarlier(store.snapshot());
  return items.map((item) => item.message.id);
}

async function watching(reader: CookoutClient): Promise<Watching> {
  const { client, reads } = counting(reader);
  const hand = handLive();
  const store = createBoardStore({ client, live: createLive(hand.adapter), url: webTestCookout().url });
  shown(store.subscribeShowing("inbox")(vi.fn<() => void>()));
  await vi.waitFor(() => {
    loadedInbox(store.snapshot());
    loadedEarlier(store.snapshot());
  });
  return { hand, reader, reads, store };
}

interface ItemAsking {
  readonly reader: CookoutClient;
  readonly message: Message;
}

async function itemOf({ message, reader }: ItemAsking): Promise<InboxItem> {
  const { items } = await reader.inbox();
  const item = items.find((each) => each.message.id === message.id) ?? null;
  if (item === null) {
    throw new Error("The message is in the reader's inbox.");
  }
  return item;
}

interface Nudged {
  readonly channel: Channel;
  readonly parent: TopLevelMessage;
}

function nudgeOn({ channel, parent }: Nudged): CookoutEvent {
  const nudge = {
    channel,
    id: 1,
    kind: "first",
    parent,
    raisedAt: "2026-11-24T00:00:00.000Z",
    text: "Quiet for 3 days",
  };
  const event = parseEvent({ data: JSON.stringify({ nudge, type: "nudge" }), event: "nudge" });
  if (event === null) {
    throw new Error("A nudge event parses.");
  }
  return event;
}

interface Held {
  readonly earlier: readonly number[];
  readonly items: readonly number[];
  readonly nudges: number;
}

function heldIn(store: BoardStore): Held {
  return { earlier: earlierIds(store), items: itemIds(store), nudges: loadedInbox(store.snapshot()).nudges.length };
}

interface ReadThenUnread {
  readonly parent: TopLevelMessage;
  readonly unread: Message;
}

async function readThenUnread({ channel, reader }: Subscribed): Promise<ReadThenUnread> {
  const parent = topLevel(await posted(channel.name));
  const unread = await posted(channel.name);
  await reader.ack(parent.id);
  return { parent, unread };
}

async function inTwoChannels(name: string): Promise<Subscribed & { readonly other: Channel }> {
  const subscribed = await subscribedIn(name);
  const { channel: other } = await adminClient().createChannel({ name: `${name}-other` });
  await subscribed.reader.subscribe(other.name);
  return { ...subscribed, other };
}
type Deleting = (deleted: Subscribed & ReadThenUnread) => Promise<readonly CookoutEvent[]>;

interface Around {
  readonly name: string;
  readonly deleting: Deleting;
}

interface HeldAround extends ReadThenUnread {
  readonly before: Held;
  readonly after: Held;
}

async function heldAround({ deleting, name }: Around): Promise<HeldAround> {
  const { channel, reader } = await subscribedIn(name);
  const { parent, unread } = await readThenUnread({ channel, reader });
  const { hand, store } = await watching(reader);
  hand.send(nudgeOn({ channel, parent }));
  const before = heldIn(store);
  for (const event of await deleting({ channel, parent, reader, unread })) {
    hand.send(event);
  }
  return { after: heldIn(store), before, parent, unread };
}

export {
  type Deleting,
  earlierIds,
  heldAround,
  inTwoChannels,
  itemIds,
  itemOf,
  loadedInbox,
  nudgeOn,
  posted,
  subscribedIn,
  topLevel,
  watching,
};
