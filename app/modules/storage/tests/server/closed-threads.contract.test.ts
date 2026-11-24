import { Array as Arr, Effect, Option, Predicate, String as Str } from "effect";
import type { Storage, StorageUnavailable } from "../../../storage/server.ts";
import {
  appendTo,
  channelFixture as channel,
  fixtureTime,
  identityFixture as identity,
  identityName,
  isoTime,
  messageId,
  newMessageFixture as newMessage,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Layer } from "effect";
import type { MessageId } from "../../../messages/index.ts";
import { tokenHash } from "../../../identities/index.ts";

const MISSING = 999_999;
const HASH_LENGTH = 64;
const GRILL = channel("grill").name;
const PAGE = { limit: 10 } as const;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const firstClosing = { closedAt: isoTime("2026-01-02T00:00:00.000Z"), closedBy: identityName("ada") };
const reopenedAt = isoTime("2026-01-04T00:00:00.000Z");
const laterClosing = { closedAt: isoTime("2026-01-03T00:00:00.000Z"), closedBy: identityName("grace") };

type Store = Storage["Service"];

type ReactionKey = Parameters<Store["removeReaction"]>[number];

function bobsThumbsUp(id: MessageId): ReactionKey {
  return { identity: identityName("bob"), messageId: id, reaction: "thumbs_up" };
}

function closedThreadWithReply<Failure, Needs>(
  layer: Layer.Layer<Storage, Failure, Needs>,
): Effect.Effect<
  { readonly parent: MessageId; readonly reply: MessageId; readonly storage: Store },
  Failure | StorageUnavailable,
  Needs
> {
  return Effect.gen(function* openClosedThread() {
    const { storage } = yield* openStore(layer);
    yield* storage.createChannel(channel("grill"));
    yield* storage.createIdentity(identity("bob"), tokenHash(Str.repeat(HASH_LENGTH)("b")));
    const parent = yield* appendTo(storage)(newMessage("grill", "parent"));
    const reply = yield* appendTo(storage)(newMessage("grill", "reply", { replyTo: parent.id }));
    yield* storage.closeThread(parent.id, firstClosing);
    return { parent: parent.id, reply: reply.id, storage };
  });
}

function present<Value>(
  found: Effect.Effect<Value | undefined, StorageUnavailable>,
): Effect.Effect<Value, StorageUnavailable> {
  return Effect.map(found, (value) => Option.getOrThrow(Option.fromUndefinedOr(value)));
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): a thread closed from a reply keeps its first closer and shows closed everywhere",
  ({ layer }) =>
    Effect.gen(function* closeKeepsFirst() {
      const { storage } = yield* openStore(layer);
      yield* storage.createChannel(channel("grill"));
      const parent = yield* appendTo(storage)(newMessage("grill", "parent"));
      const reply = yield* appendTo(storage)(newMessage("grill", "reply", { replyTo: parent.id }));
      const closed = yield* present(storage.closeThread(reply.id, firstClosing));
      const again = yield* storage.closeThread(parent.id, laterClosing);
      const [thread, page] = yield* Effect.all(
        [present(storage.getThread(parent.id)), present(storage.listChannelMessages(GRILL, PAGE))],
        ONE_AT_A_TIME,
      );

      expect(closed).toMatchObject({ changed: true, parent: { ...firstClosing, id: parent.id, replyCount: 1 } });
      expect(again).toStrictEqual({ changed: false, parent: closed.parent });
      expect([thread.parent, page.messages]).toStrictEqual([closed.parent, [closed.parent]]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): reopening clears the closer, and reopening an open thread changes nothing",
  ({ layer }) =>
    Effect.gen(function* reopenClears() {
      const { storage } = yield* openStore(layer);
      yield* storage.createChannel(channel("grill"));
      const parent = yield* appendTo(storage)(newMessage("grill", "parent"));
      yield* storage.closeThread(parent.id, firstClosing);
      const open = yield* present(storage.reopenThread(parent.id, reopenedAt));
      const openAgain = yield* storage.reopenThread(parent.id, reopenedAt);
      const thread = yield* present(storage.getThread(parent.id));

      expect(open).toStrictEqual({ changed: true, parent });
      expect([openAgain, thread.parent]).toStrictEqual([{ changed: false, parent }, parent]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a reply in a closed thread reopens it; the next reply reopens nothing",
  ({ layer }) =>
    Effect.gen(function* replyReopens() {
      const { storage } = yield* openStore(layer);
      yield* storage.createChannel(channel("grill"));
      const parent = yield* appendTo(storage)(newMessage("grill", "parent"));
      yield* storage.closeThread(parent.id, firstClosing);
      const reply = yield* storage.appendMessage(newMessage("grill", "reply", { replyTo: parent.id }));
      const [thread, second] = yield* Effect.all(
        [
          present(storage.getThread(parent.id)),
          storage.appendMessage(newMessage("grill", "second", { replyTo: parent.id })),
        ],
        ONE_AT_A_TIME,
      );

      expect(thread.parent).toMatchObject({ id: parent.id, replyCount: 1 });
      expect(thread.parent).not.toHaveProperty("closedAt");
      expect([reply, second]).toMatchObject([
        { status: "appended", threadChanged: thread.parent },
        { status: "appended" },
      ]);
      expect(second).not.toHaveProperty("threadChanged.id");
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a reply with close stores the reply and leaves the thread closed by its author",
  ({ layer }) =>
    Effect.gen(function* replyCloses() {
      const { storage } = yield* openStore(layer);
      yield* storage.createChannel(channel("grill"));
      const parent = yield* appendTo(storage)(newMessage("grill", "parent"));
      const closing = yield* storage.appendMessage({
        ...newMessage("grill", "done", { replyTo: parent.id }),
        close: true,
      });
      const thread = yield* present(storage.getThread(parent.id));
      const [stored] = thread.replies;

      expect(closing).toStrictEqual({
        message: stored,
        receipts: [],
        status: "appended",
        threadChanged: thread.parent,
      });
      expect(Arr.map(thread.replies, (reply) => reply.createdAt)).toStrictEqual([thread.parent.closedAt]);
      expect(thread.parent).toMatchObject({ closedBy: "agent", replyCount: 1 });
      expect(stored).not.toHaveProperty("close");
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a reply with close in a closed thread keeps it closed by its first closer",
  ({ layer }) =>
    Effect.gen(function* replyClosesClosed() {
      const { parent, storage } = yield* closedThreadWithReply(layer);
      const closing = yield* storage.appendMessage({
        ...newMessage("grill", "done", { replyTo: parent }),
        close: true,
      });
      const thread = yield* present(storage.getThread(parent));

      expect(closing).toMatchObject({ status: "appended" });
      expect(closing).not.toHaveProperty("threadChanged.id");
      expect(thread.parent).toMatchObject({ ...firstClosing, replyCount: 2 });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): closing or reopening a missing message finds nothing",
  ({ layer }) =>
    Effect.gen(function* missingThread() {
      const { storage } = yield* openStore(layer);
      const missing = yield* Effect.all(
        [storage.closeThread(messageId(MISSING), firstClosing), storage.reopenThread(messageId(MISSING), reopenedAt)],
        ONE_AT_A_TIME,
      );

      expect(Arr.filter(missing, Predicate.isNotUndefined)).toStrictEqual([]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): adding or removing a reaction in a closed thread leaves it closed by its first closer",
  ({ layer }) =>
    Effect.gen(function* reactionKeepsClosed() {
      const { parent: parentId, reply, storage } = yield* closedThreadWithReply(layer);
      const ids = [parentId, reply];
      const reacted = yield* Effect.forEach(
        ids,
        (id) => storage.addReaction({ ...bobsThumbsUp(id), notifiesAuthor: true, reactedAt: fixtureTime }),
        ONE_AT_A_TIME,
      );
      const afterAdding = yield* present(storage.getThread(parentId));
      const removed = yield* Effect.forEach(ids, (id) => storage.removeReaction(bobsThumbsUp(id)), ONE_AT_A_TIME);
      const [afterRemoving, page] = yield* Effect.all(
        [present(storage.getThread(parentId)), present(storage.listChannelMessages(GRILL, PAGE))],
        ONE_AT_A_TIME,
      );

      expect([reacted, removed]).toStrictEqual([
        [true, true],
        [true, true],
      ]);
      expect(afterAdding.parent).toMatchObject({ ...firstClosing, id: parentId });
      expect([afterRemoving.parent, page.messages]).toStrictEqual([afterAdding.parent, [afterAdding.parent]]);
    }),
);
