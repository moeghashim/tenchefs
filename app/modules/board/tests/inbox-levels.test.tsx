import type { BoardState, BoardStore } from "../index.ts";
import type { IdentityName, Message, TopLevelMessage } from "../../sdk/index.ts";
import { adminClient, humanIn, shown } from "./held-store.ts";
import {
  createBoardStore,
  inboxCounts,
  inboxCountsByChannel,
  inboxNewLine,
  inboxNewsByThread,
  inboxOf,
  inboxRows,
  inboxThreadsWithNews,
} from "../index.ts";
import { expect, it, vi } from "vitest";
import type { HandLive } from "../../testing/web.ts";
import { createLive } from "../../live/index.ts";
import { handLive } from "../../testing/web.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

const NOTHING_READ = 0;
const ONE = 1;

interface Thread {
  readonly store: BoardStore;
  readonly hand: HandLive;
  readonly me: IdentityName;
  readonly parent: TopLevelMessage;
  readonly reply: Message;
}

function topLevel(message: Message): TopLevelMessage {
  if (message.kind !== "top-level") {
    throw new Error("A message posted without replyTo is top-level.");
  }
  return message;
}

async function postedFor(name: string, me: IdentityName): Promise<Pick<Thread, "parent" | "reply">> {
  const { message } = await adminClient().createMessage({ channel: name, text: "Ship it?" });
  const parent = topLevel(message);
  const { message: reply } = await adminClient().createMessage({
    channel: name,
    replyTo: parent.id,
    text: `@${me} ok?`,
  });
  return { parent, reply };
}

async function mentionedInThread(name: string): Promise<Thread> {
  await adminClient().createChannel({ name });
  const { client, name: me } = await humanIn(name);
  await client.subscribe(name);
  const { parent, reply } = await postedFor(name, me);
  const hand = handLive();
  const store = createBoardStore({ client, live: createLive(hand.adapter), url: webTestCookout().url });
  shown(store.subscribeShowing("inbox")(vi.fn<() => void>()));
  await vi.waitFor(() => {
    expect(inboxOf(store.snapshot()).status).toBe("loaded");
  });
  return { hand, me, parent, reply, store };
}

function levelsOf(state: BoardState, { me, parent }: Pick<Thread, "me" | "parent">): unknown {
  const looking = { me, state };
  return {
    byChannel: inboxCountsByChannel(looking).get(parent.channel),
    counts: inboxCounts(looking),
    news: inboxNewsByThread(looking).get(parent.id) ?? null,
    rows: inboxRows(looking).map((row) => [row.key, row.why, row.count]),
    threads: inboxThreadsWithNews({ channel: parent.channel, state }),
  };
}

it("rows, counts by channel and news by thread follow a read position fed to the store", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const thread = await mentionedInThread("web-inbox-levels");
  const { hand, parent, reply, store } = thread;
  const before = levelsOf(store.snapshot(), thread);
  hand.send({
    readPosition: { channel: parent.channel, messageId: reply.id, thread: parent.id },
    type: "read-position",
  });
  const after = levelsOf(store.snapshot(), thread);

  expect({ after, before }).toStrictEqual({
    after: {
      byChannel: { activity: ONE, forYou: 0 },
      counts: { activity: ONE, forYou: 0 },
      news: null,
      rows: [[`channel ${parent.channel}`, "subscribed-channel", ONE]],
      threads: [],
    },
    before: {
      byChannel: { activity: ONE, forYou: ONE },
      counts: { activity: ONE, forYou: ONE },
      news: { count: ONE, forYou: ONE },
      rows: [
        [`thread ${String(parent.id)}`, "mentioned-you", ONE],
        [`channel ${parent.channel}`, "subscribed-channel", ONE],
      ],
      threads: [parent.id],
    },
  });
});

it("each level selector returns the same object until the items it reads change", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const thread = await mentionedInThread("web-inbox-levels-same");
  const looking = { me: thread.me, state: thread.store.snapshot() };
  const once = [inboxRows(looking), inboxCounts(looking), inboxCountsByChannel(looking), inboxNewsByThread(looking)];
  const again = [inboxRows(looking), inboxCounts(looking), inboxCountsByChannel(looking), inboxNewsByThread(looking)];

  expect(again.map((each, index) => each === once[index])).toStrictEqual([true, true, true, true]);
});

it("the New line follows the read position fed to the store, and moves above every message when it moves back", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const { hand, parent, store } = await mentionedInThread("web-inbox-new-line");
  const place = { channel: parent.channel, thread: null };
  const unread = inboxNewLine({ ...place, state: store.snapshot() });
  hand.send({ readPosition: { ...place, messageId: parent.id }, type: "read-position" });
  const read = inboxNewLine({ ...place, state: store.snapshot() });
  hand.send({ readPosition: { ...place, messageId: null }, type: "read-position-moved-back" });
  const movedBack = inboxNewLine({ ...place, state: store.snapshot() });

  expect({ movedBack, read, unread }).toStrictEqual({ movedBack: NOTHING_READ, read: parent.id, unread: null });
});

it("a channel's threads with news and its New line are null until the Inbox loads", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const { channel } = await adminClient().createChannel({ name: "web-inbox-unloaded" });
  const store = createBoardStore({
    client: adminClient(),
    live: createLive(handLive().adapter),
    url: webTestCookout().url,
  });
  const place = { channel: channel.name, state: store.snapshot() };

  expect([inboxThreadsWithNews(place), inboxNewLine({ ...place, thread: null })]).toStrictEqual([null, null]);
});
