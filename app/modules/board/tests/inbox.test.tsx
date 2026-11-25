import type { BoardState, BoardStore } from "../index.ts";
import type { Channel, CookoutClient, CookoutEvent, InboxItem, Message, TopLevelMessage } from "../../sdk/index.ts";
import { adminClient, bounce, humanIn, shown } from "./held-store.ts";
import { createBoardStore, earlierOf, inboxCountsByChannel, inboxOf, nudgesOf } from "../index.ts";
import { expect, it, vi } from "vitest";
import type { HandLive } from "../../testing/web.ts";
import { createLive } from "../../live/index.ts";
import { handLive } from "../../testing/web.ts";
import { parseEvent } from "../../sdk/index.ts";
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

async function itemOf(reader: CookoutClient, message: Message): Promise<InboxItem> {
  const { items } = await reader.inbox();
  const item = items.find((each) => each.message.id === message.id) ?? null;
  if (item === null) {
    throw new Error("The message is in the reader's inbox.");
  }
  return item;
}

function nudgeOn(channel: Channel, parent: TopLevelMessage): CookoutEvent {
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

type Selected = readonly unknown[];

function selected(state: BoardState): Selected {
  return [inboxOf(state), earlierOf(state), nudgesOf(state)];
}

it("one load reads the Inbox once and the history's first page once, for every part", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const { channel, reader } = await subscribedIn("web-inbox-one-load");
  const first = await posted(channel.name);
  const { reads, store } = await watching(reader);

  expect({ items: itemIds(store), reads: reads() }).toStrictEqual({
    items: [first.id],
    reads: { history: 1, inbox: 1 },
  });
});

it("each event applied twice changes nothing the second time", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const { channel, reader } = await subscribedIn("web-inbox-twice");
  const parent = topLevel(await posted(channel.name));
  const { hand, store } = await watching(reader);
  const later = await posted(channel.name);
  const { message: closed } = await adminClient().closeThread(parent.id);
  const events: readonly CookoutEvent[] = [
    { item: await itemOf(reader, later), type: "inbox-item" },
    nudgeOn(channel, parent),
    { parent: topLevel(closed), type: "thread" },
    { readPosition: { channel: channel.name, messageId: parent.id, thread: null }, type: "read-position" },
    { readPosition: { channel: channel.name, messageId: null, thread: null }, type: "read-position-moved-back" },
    { channel, type: "channel-deleted" },
  ];
  const unchanged = events.map((event) => {
    hand.send(event);
    const once = selected(store.snapshot());
    hand.send(event);
    return selected(store.snapshot()).every((part, index) => part === once[index]);
  });

  expect(unchanged).toStrictEqual(events.map(() => true));
});

it("a read position drops the items it covers from For you and the counts, and moves them to Earlier", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const { channel, reader } = await subscribedIn("web-inbox-read-position");
  const first = await posted(channel.name);
  const second = await posted(channel.name);
  const { hand, store } = await watching(reader);
  hand.send({ readPosition: { channel: channel.name, messageId: first.id, thread: null }, type: "read-position" });

  expect({
    counts: inboxCountsByChannel({ me: "nobody", state: store.snapshot() }).get(channel.name),
    earlier: earlierIds(store),
    items: itemIds(store),
  }).toStrictEqual({ counts: { activity: 1, forYou: 0 }, earlier: [first.id], items: [second.id] });
});

it("a thread closing changes its Inbox entry and reads its Nudge", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const { channel, reader } = await subscribedIn("web-inbox-closing");
  const parent = topLevel(await posted(channel.name));
  const { hand, store } = await watching(reader);
  hand.send(nudgeOn(channel, parent));
  const { message: closed } = await adminClient().closeThread(parent.id);
  hand.send({ parent: topLevel(closed), type: "thread" });
  const { items, nudges } = loadedInbox(store.snapshot());

  expect({ closed: items.map((item) => typeof item.parent.closedAt), nudges }).toStrictEqual({
    closed: ["string"],
    nudges: [],
  });
});

it("a deleted channel takes its items, Earlier rows and Nudges out", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const { channel, reader } = await subscribedIn("web-inbox-channel-deleted");
  const { parent, unread } = await readThenUnread({ channel, reader });
  const { hand, store } = await watching(reader);
  hand.send(nudgeOn(channel, parent));
  const before = heldIn(store);
  hand.send({ channel, type: "channel-deleted" });
  const after = heldIn(store);

  expect({ after, before }).toStrictEqual({
    after: { earlier: [], items: [], nudges: 0 },
    before: { earlier: [parent.id], items: [unread.id], nudges: 1 },
  });
});

it("the link coming back brings back an item marked unread during the gap and drops one acked elsewhere", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const { channel, other, reader } = await inTwoChannels("web-inbox-catch-up");
  const [read, acked] = await Promise.all([posted(channel.name), posted(other.name)]);
  await reader.ack(read.id);
  const { hand, reads, store } = await watching(reader);
  hand.report("down");
  await Promise.all([reader.markUnread(read.id), reader.ack(acked.id)]);
  bounce(hand);
  await vi.waitFor(() => {
    expect(itemIds(store)).toStrictEqual([read.id]);
  });

  expect({ earlier: earlierIds(store), reads: reads() }).toStrictEqual({
    earlier: [acked.id],
    reads: { history: 2, inbox: 2 },
  });
});
