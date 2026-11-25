import type { ChannelLoaded, ThreadLoaded } from "./held-store.ts";
import type { CookoutClient, MessageId, TopLevelMessage } from "../../sdk/index.ts";
import {
  adminClient,
  bothShown,
  bounce,
  channelShown,
  countingReads,
  humanIn,
  idsOf,
  opened,
  postedIn,
  repliedTo,
  shown,
} from "./held-store.ts";
import { channelPage, createBoardStore, messageBeforeOf, threadOf } from "../index.ts";
import { expect, it, vi } from "vitest";
import { createLive } from "../../live/index.ts";
import { handLive } from "../../testing/web.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

const SMALL_PAGE = 2;

const ONE_REPLY = 1;

const LAST = -1;

interface Posting {
  readonly client: CookoutClient;
  readonly parent: TopLevelMessage;
}

async function postedBy({ client, parent }: Posting): Promise<readonly MessageId[]> {
  const posted = await Promise.all(
    ["One", "Two", "Three"].map(async (text) => {
      const { message } = await client.createMessage({ channel: parent.channel, text });
      return message.id;
    }),
  );
  return posted.toSorted((first, second) => first - second);
}

function newestOf(ids: readonly MessageId[]): MessageId | null {
  return ids.at(LAST) ?? null;
}

function ackedAt({ read }: ChannelLoaded | ThreadLoaded): MessageId | null {
  if (read.status !== "acked") {
    return null;
  }
  return read.readPosition.messageId;
}

it("a message event shows in its channel page and its thread once, and the same event again changes nothing", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await postedIn("store-messages-event");
  const { hand, page, thread } = await bothShown({ parent });
  const reply = await repliedTo({ parent });
  hand.send({ message: reply, type: "message" });
  const [pageAfter, threadAfter] = [page(), thread()];
  hand.send({ message: reply, type: "message" });

  expect([pageAfter.messages.map((message) => message.replyCount), idsOf(threadAfter.replies)]).toStrictEqual([
    [ONE_REPLY],
    [reply.id],
  ]);
  expect(page()).toBe(pageAfter);
  expect(thread()).toBe(threadAfter);
});

it("a thread event closes the thread in its channel page and its thread panel at once", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const parent = await postedIn("store-messages-closed");
  const { hand, page, thread } = await bothShown({ parent });
  const { message: closed } = await adminClient().closeThread(parent.id);
  hand.send({ parent: closed, type: "thread" });

  expect([page().messages.map((message) => message.closedAt), thread().parent.closedAt]).toStrictEqual([
    [closed.closedAt],
    closed.closedAt,
  ]);
});

it("a message posted through the store shows once, though the stream also sends it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const parent = await postedIn("store-messages-posted");
  const { hand, store } = opened();
  const page = await channelShown({ channel: parent.channel, store });
  const posted = vi.fn<() => void>();
  store.channelPages.post(parent.channel, { files: [], posted, text: "Mine." });
  await vi.waitFor(() => {
    expect(posted).toHaveBeenCalledTimes(ONE_REPLY);
  });
  for (const message of page().messages) {
    hand.send({ message, type: "message" });
  }

  expect(page().messages.map((message) => message.text)).toStrictEqual(["Ship it?", "Mine."]);
});

it("a thread event heard while the channel page is read wins over what the read brings", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await postedIn("store-messages-read");
  const hand = handLive();
  const admin = adminClient();
  const store = createBoardStore({
    client: {
      ...admin,
      listMessages: async (channel, query) => {
        const answer = await admin.listMessages(channel, query);
        const { message } = await admin.closeThread(parent.id);
        hand.send({ parent: message, type: "thread" });
        return answer;
      },
    },
    live: createLive(hand.adapter),
    url: webTestCookout().url,
  });
  const page = await channelShown({ channel: parent.channel, store });

  expect(page().messages.map((message) => typeof message.closedAt)).toStrictEqual(["string"]);
});

it("link down then up reads each open channel again, paging back to what it shows, and its thread, acking the newest", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const parent = await postedIn("store-messages-gap");
  const bob = await humanIn("store-messages-gap");
  const { hand, page, thread } = await bothShown({ pageSize: SMALL_PAGE, parent });
  hand.report("down");
  const missed = await postedBy({ client: bob.client, parent });
  const reply = await repliedTo({ client: bob.client, parent });
  hand.report("up");

  await vi.waitFor(() => {
    expect([idsOf(page().messages), ackedAt(page()), idsOf(thread().replies), ackedAt(thread())]).toStrictEqual([
      [parent.id, ...missed],
      newestOf(missed),
      [reply.id],
      reply.id,
    ]);
  });
});

it("a channel page nobody shows isn't read again on a link back", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const parent = await postedIn("store-messages-hidden");
  const { client, reads } = countingReads();
  const { hand, store } = opened({ client });
  const unsubscribe = store.channelPages.subscribeShowing(parent.channel)(vi.fn<() => void>());
  await vi.waitFor(() => {
    expect(channelPage(parent.channel)(store.snapshot()).status).toBe("loaded");
  });
  unsubscribe();
  bounce(hand);

  expect(reads).toStrictEqual([parent.channel]);
});

it("a read-receipt event shows once on its message, and the same event again keeps the selector's object", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await postedIn("store-messages-receipt");
  const bob = await humanIn("store-messages-receipt");
  const { hand, page } = await bothShown({ parent });
  const receipt = { identity: bob.name, messageId: parent.id, seen: true };
  hand.send({ receipt, type: "read-receipt" });
  const after = page();
  hand.send({ receipt, type: "read-receipt" });

  expect(after.receipts).toStrictEqual([receipt]);
  expect(page()).toBe(after);
});

it("a read-receipt event for a message the store doesn't hold leaves the store as it was", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await postedIn("store-messages-receipt-unheld");
  const { channel: elsewhere } = await postedIn("store-messages-receipt-elsewhere");
  const { hand, store } = opened();
  await channelShown({ channel: elsewhere, store });
  const before = store.snapshot().messages;
  hand.send({ receipt: { identity: parent.author.name, messageId: parent.id, seen: true }, type: "read-receipt" });

  expect(store.snapshot().messages).toBe(before);
});

it("a change asked of a channel page nobody has read leaves the store as it was", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { channel } = await postedIn("store-messages-unread");
  const { store } = opened();
  const before = store.snapshot().messages;
  store.channelPages.editCallData(channel, "{}");

  expect([store.snapshot().messages, channelPage(channel)(store.snapshot()).status]).toStrictEqual([before, "loading"]);
});

it("link down then up reads again the message before each shown place, and not one nobody shows", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const [kept, dropped] = await Promise.all([postedIn("store-before-kept"), postedIn("store-before-dropped")]);
  const { client, reads } = countingReads();
  const { hand, store } = opened({ client });
  shown(store.subscribeShowingBefore(kept)(vi.fn<() => void>()));
  const hide = store.subscribeShowingBefore(dropped)(vi.fn<() => void>());
  await vi.waitFor(() => {
    expect([
      messageBeforeOf(kept)(store.snapshot()).status,
      messageBeforeOf(dropped)(store.snapshot()).status,
    ]).toStrictEqual(["loaded", "loaded"]);
  });
  hide();
  bounce(hand);

  await vi.waitFor(() => {
    expect(reads).toStrictEqual([kept.channel, dropped.channel, kept.channel]);
  });
});

it("an ID the stream reuses for a reply leaves its channel page and its thread panel", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const parent = await postedIn("store-messages-reused");
  const { hand, page, store } = await bothShown({ parent });
  const reply = await repliedTo({ parent });
  hand.send({ message: { ...reply, id: parent.id }, type: "message" });

  expect([idsOf(page().messages), threadOf(parent)(store.snapshot()).status]).toStrictEqual([[], "loading"]);
});
