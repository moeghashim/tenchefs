import type { ChannelName, CookoutClient, CookoutEvent, Message, MessageId, TopLevelMessage } from "../../sdk/index.ts";
import {
  adminClient,
  bothShown,
  bounce,
  countingReads,
  idsOf,
  opened,
  postedIn,
  repliedTo,
  shown,
} from "./held-store.ts";
import { channelPage, threadOf } from "../index.ts";
import { expect, it, vi } from "vitest";
import type { BoardStore } from "../index.ts";
import type { HandLive } from "../../testing/web.ts";

async function deletedEvent(message: Message): Promise<CookoutEvent> {
  const { message: deleted } = await adminClient().deleteMessage(message.id);
  if (deleted.kind === "top-level") {
    return { message: deleted, type: "message-deleted" };
  }
  const { parent } = await adminClient().getThread(deleted.replyTo);
  return { message: deleted, parent, type: "message-deleted" };
}

function deletedIn(state: { readonly status: string; readonly deleted?: ReadonlySet<number> }): readonly number[] {
  if (state.status !== "loaded" || typeof state.deleted !== "object") {
    return [];
  }
  return [...state.deleted];
}

it("a deleted reply keeps its slot in a shown thread, marked deleted, and its top-level message counts one reply fewer", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await postedIn("web-deleted-reply");
  const [kept, gone] = [await repliedTo({ parent }), await repliedTo({ parent })];
  const { hand, page, thread } = await bothShown({ parent });
  hand.send(await deletedEvent(gone));
  const { parent: now } = await adminClient().getThread(parent.id);

  expect({
    deleted: [...thread().deleted],
    replies: idsOf(thread().replies),
    replyCount: page().messages.map((message) => message.replyCount),
  }).toStrictEqual({ deleted: [gone.id], replies: [kept.id, gone.id], replyCount: [now.replyCount] });
});

it("a deleted thread keeps its top-level message's slot in a shown channel page, and its whole shown thread, marked deleted", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await postedIn("web-deleted-thread");
  const reply = await repliedTo({ parent });
  const { hand, page, thread } = await bothShown({ parent });
  const event = await deletedEvent(parent);
  hand.send(event);
  const once = { page: page(), thread: thread() };
  hand.send(event);

  expect({
    page: { deleted: [...page().deleted], ids: idsOf(page().messages) },
    same: [page() === once.page, thread() === once.thread],
    thread: [...thread().deleted].toSorted((one, other) => one - other),
  }).toStrictEqual({
    page: { deleted: [parent.id], ids: [parent.id] },
    same: [true, true],
    thread: [parent.id, reply.id],
  });
});

it("a link back keeps a deleted message's slot in the channel page and thread still shown", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await postedIn("web-deleted-catch-up");
  const reply = await repliedTo({ parent });
  const { hand, page, thread } = await bothShown({ parent });
  hand.send(await deletedEvent(reply));
  const { message: later } = await adminClient().createMessage({ channel: parent.channel, text: "Later" });
  bounce(hand);
  await vi.waitFor(() => {
    expect(idsOf(page().messages)).toStrictEqual([parent.id, later.id]);
  });

  expect({ deleted: [...thread().deleted], replies: idsOf(thread().replies) }).toStrictEqual({
    deleted: [reply.id],
    replies: [reply.id],
  });
});

interface Leaving {
  readonly parent: TopLevelMessage;
  readonly gone: readonly Message[];
}

interface Left {
  readonly store: BoardStore;
  readonly reads: readonly string[];
  readonly place: { readonly channel: ChannelName; readonly id: MessageId };
}

async function loaded({ place, store }: Omit<Left, "reads">): Promise<void> {
  await vi.waitFor(() => {
    expect([
      channelPage(place.channel)(store.snapshot()).status,
      threadOf(place)(store.snapshot()).status,
    ]).toStrictEqual(["loaded", "loaded"]);
  });
}

interface Sending {
  readonly hand: HandLive;
  readonly gone: readonly Message[];
}

async function sentDeleted({ gone, hand }: Sending): Promise<void> {
  const events = await Promise.all(
    gone.map(async (message) => {
      const event = await deletedEvent(message);
      return event;
    }),
  );
  for (const event of events) {
    hand.send(event);
  }
}

async function deletedThenLeft({ gone, parent }: Leaving): Promise<Left> {
  const { client, reads } = countingReads();
  const { hand, store } = opened({ client });
  const place = { channel: parent.channel, id: parent.id };
  const leavePage = store.channelPages.subscribeShowing(parent.channel)(vi.fn<() => void>());
  const leaveThread = store.threads.subscribeShowing(place, true)(vi.fn<() => void>());
  await loaded({ place, store });
  await sentDeleted({ gone, hand });
  leavePage();
  leaveThread();
  return { place, reads, store };
}

it("opening a channel page or thread again drops the deleted message's slot", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const parent = await postedIn("web-deleted-reopened");
  const { message: other } = await adminClient().createMessage({ channel: parent.channel, text: "Other" });
  const reply = await repliedTo({ parent });
  const { place, reads, store } = await deletedThenLeft({ gone: [reply, other], parent });
  shown(store.channelPages.subscribeShowing(parent.channel)(vi.fn<() => void>()));
  shown(store.threads.subscribeShowing(place, true)(vi.fn<() => void>()));
  const now = {
    page: deletedIn(channelPage(parent.channel)(store.snapshot())),
    thread: deletedIn(threadOf(place)(store.snapshot())),
  };
  await vi.waitFor(() => {
    expect(reads).toStrictEqual([parent.channel, parent.channel]);
  });

  expect(now).toStrictEqual({ page: [], thread: [] });
});

it("a deleted message nobody shows leaves the store's pages and threads as they were", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const parent: TopLevelMessage = await postedIn("web-deleted-unshown");
  const { hand, store } = opened();
  const before = store.snapshot();
  hand.send(await deletedEvent(parent));

  expect(store.snapshot()).toBe(before);
});

async function down(): Promise<never> {
  await Promise.resolve();
  throw new Error("The board is down.");
}

function failingReads(): CookoutClient {
  return { ...adminClient(), getThread: down, listMessages: down };
}

it("a deleted message reaching a channel page and thread that failed to load leaves the store as it was", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await postedIn("web-deleted-failed");
  const { hand, store } = opened({ client: failingReads() });
  const place = { channel: parent.channel, id: parent.id };
  shown(store.channelPages.subscribeShowing(parent.channel)(vi.fn<() => void>()));
  shown(store.threads.subscribeShowing(place, true)(vi.fn<() => void>()));
  await vi.waitFor(() => {
    expect([
      channelPage(parent.channel)(store.snapshot()).status,
      threadOf(place)(store.snapshot()).status,
    ]).toStrictEqual(["failed", "failed"]);
  });
  const before = store.snapshot();
  hand.send(await deletedEvent(parent));

  expect(store.snapshot()).toBe(before);
});

it("opening a thread again after its top-level message was deleted reads it afresh", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const parent = await postedIn("web-deleted-parent-reopened");
  await repliedTo({ parent });
  const { place, store } = await deletedThenLeft({ gone: [parent], parent });
  shown(store.threads.subscribeShowing(place, true)(vi.fn<() => void>()));

  expect(threadOf(place)(store.snapshot()).status).toBe("loading");
});
