import { Array as Arr, Effect, Option, Predicate } from "effect";
import type { Storage, StorageUnavailable } from "../../../storage/server.ts";
import {
  appendTo,
  channelFixture as channel,
  identityName,
  isoTime,
  messageId,
  newMessageFixture as newMessage,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Message } from "../../../messages/index.ts";

const GRILL = channel("grill").name;
const PAGE = { limit: 10 } as const;
const MISSING = 999_999;
const ONE = 1;
const NONE = 0;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const deleting = { deletedAt: isoTime("2026-01-05T00:00:00.000Z"), deletedBy: identityName("ada") };

type Store = Storage["Service"];

function present<Value>(
  found: Effect.Effect<Value | undefined, StorageUnavailable>,
): Effect.Effect<Value, StorageUnavailable> {
  return Effect.map(found, (value) => Option.getOrThrow(Option.fromUndefinedOr(value)));
}

interface ThreadOfThree {
  readonly parent: Message;
  readonly first: Message;
  readonly second: Message;
}

function threadOfThree(storage: Store): Effect.Effect<ThreadOfThree, StorageUnavailable> {
  return Effect.gen(function* postThread() {
    yield* storage.createChannel(channel("grill"));
    const parent = yield* appendTo(storage)(newMessage("grill", "parent"));
    const first = yield* appendTo(storage)(
      newMessage("grill", "first", { author: { name: "bob" }, replyTo: parent.id }),
    );
    const second = yield* appendTo(storage)(
      newMessage("grill", "second", { author: { name: "cy" }, replyTo: parent.id }),
    );
    return { first, parent, second };
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): deleting a reply answers it as it was and leaves the rest of the thread, recounted",
  ({ layer }) =>
    Effect.gen(function* deleteReply() {
      const { storage } = yield* openStore(layer);
      const { first, parent, second } = yield* threadOfThree(storage);
      const deleted = yield* storage.deleteMessage(second.id, deleting);
      const { fromDeleted, page, thread } = yield* Effect.all(
        {
          fromDeleted: storage.getThread(second.id),
          page: present(storage.listChannelMessages(GRILL, PAGE)),
          thread: present(storage.getThread(parent.id)),
        },
        ONE_AT_A_TIME,
      );

      expect(deleted).toMatchObject({ id: second.id, kind: "reply", replyTo: parent.id, text: "second" });
      expect(fromDeleted).toBeUndefined();
      expect(thread).toMatchObject({
        parent: { id: parent.id, latestReplyId: first.id, repliers: [{ name: "bob" }], replyCount: ONE },
        replies: [{ id: first.id }],
      });
      expect(thread.replies).toHaveLength(ONE);
      expect(page.messages).toMatchObject([
        { id: parent.id, latestReplyAt: first.createdAt, latestReplyId: first.id, replyCount: ONE },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): deleting a top-level message deletes its whole thread, replies included",
  ({ layer }) =>
    Effect.gen(function* deleteThread() {
      const { storage } = yield* openStore(layer);
      const { first, parent, second } = yield* threadOfThree(storage);
      const kept = yield* appendTo(storage)(newMessage("grill", "kept"));
      const deleted = yield* storage.deleteMessage(parent.id, deleting);
      const threads = yield* Effect.forEach(
        [parent.id, first.id, second.id],
        (id) => storage.getThread(id),
        ONE_AT_A_TIME,
      );
      const page = yield* present(storage.listChannelMessages(GRILL, PAGE));

      expect(deleted).toMatchObject({ id: parent.id, kind: "top-level", replyCount: 2, text: "parent" });
      expect(Arr.filter(threads, Predicate.isNotUndefined)).toStrictEqual([]);
      expect(page).toMatchObject({ hasMore: false, messages: [{ id: kept.id }] });
      expect(page.messages).toHaveLength(ONE);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a missing or already deleted message, or a reply in a deleted thread, deletes nothing",
  ({ layer }) =>
    Effect.gen(function* deleteNothing() {
      const { storage } = yield* openStore(layer);
      const { first, parent } = yield* threadOfThree(storage);
      yield* storage.deleteMessage(parent.id, deleting);
      const again = yield* Effect.all(
        [
          storage.deleteMessage(parent.id, deleting),
          storage.deleteMessage(first.id, deleting),
          storage.deleteMessage(messageId(MISSING), deleting),
        ],
        ONE_AT_A_TIME,
      );

      expect(Arr.filter(again, Predicate.isNotUndefined)).toStrictEqual([]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an identity whose only messages are deleted still counts as named by a message",
  ({ layer }) =>
    Effect.gen(function* countDeleted() {
      const { storage } = yield* openStore(layer);
      const { first, parent } = yield* threadOfThree(storage);
      yield* storage.deleteMessage(first.id, deleting);
      yield* storage.deleteMessage(parent.id, deleting);
      const counts = yield* Effect.all(
        [storage.countMessagesBy(identityName("bob")), storage.countMessagesBy(identityName("cy"))],
        ONE_AT_A_TIME,
      );

      expect(counts).toStrictEqual([ONE, ONE]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): deleting a channel removes its deleted messages too, so they no longer count",
  ({ layer }) =>
    Effect.gen(function* deleteChannel() {
      const { storage } = yield* openStore(layer);
      const { first } = yield* threadOfThree(storage);
      yield* storage.deleteMessage(first.id, deleting);
      yield* storage.deleteChannel(GRILL);
      const count = yield* storage.countMessagesBy(identityName("bob"));

      expect(count).toBe(NONE);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a reply naming a deleted reply in a live thread joins that thread",
  ({ layer }) =>
    Effect.gen(function* replyToDeletedReply() {
      const { storage } = yield* openStore(layer);
      const { parent, second } = yield* threadOfThree(storage);
      yield* storage.deleteMessage(second.id, deleting);
      const target = yield* storage.findReplyTarget(second.id);
      const joined = yield* storage.appendMessage(newMessage("grill", "to the gone reply", { replyTo: second.id }));

      expect(target).toStrictEqual({ channel: GRILL, thread: parent.id, threadDeleted: false });
      expect(joined).toMatchObject({ message: { kind: "reply", replyTo: parent.id }, status: "appended" });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a reply naming any message in a deleted thread is refused thread_deleted",
  ({ layer }) =>
    Effect.gen(function* replyIntoDeleted() {
      const { storage } = yield* openStore(layer);
      const { first, parent, second } = yield* threadOfThree(storage);
      yield* storage.deleteMessage(second.id, deleting);
      yield* storage.deleteMessage(parent.id, deleting);
      const refused = yield* Effect.all(
        Arr.map([parent.id, first.id, second.id], (replyTo) =>
          storage.appendMessage(newMessage("grill", "too late", { replyTo })),
        ),
        ONE_AT_A_TIME,
      );
      const [gone, missing] = yield* Effect.all(
        [storage.findReplyTarget(first.id), storage.findReplyTarget(messageId(MISSING))],
        ONE_AT_A_TIME,
      );

      expect(refused).toStrictEqual(Arr.replicate({ status: "thread_deleted" }, refused.length));
      expect(gone).toStrictEqual({ channel: GRILL, thread: parent.id, threadDeleted: true });
      expect(missing).toBeUndefined();
    }),
);
