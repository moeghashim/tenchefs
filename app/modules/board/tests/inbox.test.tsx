import { adminClient, bounce } from "./held-store.ts";
import {
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
} from "./inbox-store.ts";
import { earlierOf, inboxCountsByChannel, inboxOf, nudgesOf } from "../index.ts";
import { expect, it, vi } from "vitest";
import type { BoardState } from "../index.ts";
import type { CookoutEvent } from "../../sdk/index.ts";
import type { Deleting } from "./inbox-store.ts";

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
    { item: await itemOf({ message: later, reader }), type: "inbox-item" },
    nudgeOn({ channel, parent }),
    { parent: topLevel(closed), type: "thread" },
    { readPosition: { channel: channel.name, messageId: parent.id, thread: null }, type: "read-position" },
    { readPosition: { channel: channel.name, messageId: null, thread: null }, type: "read-position-moved-back" },
    { message: later, type: "message-deleted" },
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
  hand.send(nudgeOn({ channel, parent }));
  const { message: closed } = await adminClient().closeThread(parent.id);
  hand.send({ parent: topLevel(closed), type: "thread" });
  const { items, nudges } = loadedInbox(store.snapshot());

  expect({ closed: items.map((item) => typeof item.parent.closedAt), nudges }).toStrictEqual({
    closed: ["string"],
    nudges: [],
  });
});

const deletions: readonly (readonly [string, Deleting])[] = [
  [
    "web-inbox-channel-deleted",
    async ({ channel }) => {
      const deleted = await adminClient().deleteChannel(channel.name);
      return [{ channel: deleted.channel, type: "channel-deleted" }];
    },
  ],
  [
    "web-inbox-message-deleted",
    async ({ parent, unread }) => {
      const gone = await Promise.all([adminClient().deleteMessage(unread.id), adminClient().deleteMessage(parent.id)]);
      return gone.map(({ message }) => ({ message, type: "message-deleted" }));
    },
  ],
];

it.each(deletions)(
  "a deleted channel or thread (%s) takes its items, Earlier rows and Nudges out",
  {
    timeout: 10_000,
  },
  async (name, deleting) => {
    expect.hasAssertions();

    const { after, before, parent, unread } = await heldAround({ deleting, name });

    expect({ after, before }).toStrictEqual({
      after: { earlier: [], items: [], nudges: 0 },
      before: { earlier: [parent.id], items: [unread.id], nudges: 1 },
    });
  },
);

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
