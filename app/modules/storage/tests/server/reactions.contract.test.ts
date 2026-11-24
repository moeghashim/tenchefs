import { Effect, String as Str, pipe } from "effect";
import type { MessageId, ReactionName } from "../../../messages/index.ts";
import type { Storage, StorageUnavailable } from "../../../storage/server.ts";
import {
  appendTo,
  channelFixture as channel,
  channelName,
  fixtureTime,
  identityFixture as identity,
  isoTime,
  messageId,
  identityName as nameOf,
  newMessageFixture as newMessage,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Layer } from "effect";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const NO_SUCH_MESSAGE = 999;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const LATER = isoTime("2026-01-01T00:05:00.000Z");
const ANN = { author: { name: "ann" } } as const;
const PEOPLE = [
  ["ann", "a"],
  ["bob", "b"],
  ["cat", "c"],
] as const;

type Store = Storage["Service"];

type Adding = Parameters<Store["addReaction"]>[number];

function storeWithPeople<Failure, Needs>(
  layer: Layer.Layer<Storage, Failure, Needs>,
): Effect.Effect<Store, Failure | StorageUnavailable, Needs> {
  return Effect.gen(function* openWithPeople() {
    const { storage } = yield* openStore(layer);
    yield* storage.createChannel(channel("grill"));
    yield* pipe(
      PEOPLE,
      Effect.forEach(
        ([name, letter]) => storage.createIdentity(identity(name), tokenHash(Str.repeat(HASH_LENGTH)(letter))),
        ONE_AT_A_TIME,
      ),
    );
    return storage;
  });
}

function reacting(id: MessageId, name: string, reaction: ReactionName = "thumbs_up"): Adding {
  return { identity: nameOf(name), messageId: id, notifiesAuthor: true, reactedAt: fixtureTime, reaction };
}

function reactAll(
  storage: Store,
  reactions: readonly Adding[],
): Effect.Effect<readonly (boolean | undefined)[], StorageUnavailable> {
  return Effect.forEach(reactions, storage.addReaction, ONE_AT_A_TIME);
}

const missing = messageId(NO_SUCH_MESSAGE);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an identity has at most one of each reaction on a message, and may have both",
  ({ layer }) =>
    Effect.gen(function* oneOfEach() {
      const storage = yield* storeWithPeople(layer);
      const message = yield* appendTo(storage)(newMessage("grill", "ship it?", ANN));
      const added = yield* reactAll(storage, [
        reacting(message.id, "bob"),
        { ...reacting(message.id, "bob"), reactedAt: LATER },
        reacting(message.id, "bob", "thumbs_down"),
        reacting(message.id, "cat"),
      ]);
      const listed = yield* storage.listReactions([message.id]);

      const at = { messageId: message.id, reactedAt: fixtureTime };

      expect({ added, listed }).toStrictEqual({
        added: [true, false, true, true],
        listed: [
          { ...at, identity: "bob", reaction: "thumbs_up" },
          { ...at, identity: "bob", reaction: "thumbs_down" },
          { ...at, identity: "cat", reaction: "thumbs_up" },
        ],
      });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): there is no reaction to add or remove on a message that doesn't exist",
  ({ layer }) =>
    Effect.gen(function* noMessage() {
      const storage = yield* storeWithPeople(layer);
      const added = yield* storage.addReaction(reacting(missing, "bob"));
      const removed = yield* storage.removeReaction(reacting(missing, "bob"));

      expect(added).toBeUndefined();
      expect(removed).toBeUndefined();
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): removing a reaction leaves the identity's other reactions and other identities' alone",
  ({ layer }) =>
    Effect.gen(function* remove() {
      const storage = yield* storeWithPeople(layer);
      const message = yield* appendTo(storage)(newMessage("grill", "ship it?", ANN));
      yield* reactAll(storage, [
        reacting(message.id, "bob"),
        reacting(message.id, "bob", "thumbs_down"),
        reacting(message.id, "cat"),
      ]);
      const removed = yield* storage.removeReaction(reacting(message.id, "bob"));
      const again = yield* storage.removeReaction(reacting(message.id, "bob"));
      const listed = yield* storage.listReactions([message.id]);

      expect({ again, listed, removed }).toMatchObject({
        again: false,
        listed: [
          { identity: "bob", reaction: "thumbs_down" },
          { identity: "cat", reaction: "thumbs_up" },
        ],
        removed: true,
      });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): the author sees the reactions that notify it until it marks them seen",
  ({ layer }) =>
    Effect.gen(function* unseen() {
      const storage = yield* storeWithPeople(layer);
      const post = appendTo(storage);
      const [first, second, bobs] = yield* Effect.all(
        [
          post(newMessage("grill", "first", ANN)),
          post(newMessage("grill", "second", ANN)),
          post(newMessage("grill", "bob's", { author: { name: "bob" } })),
        ],
        ONE_AT_A_TIME,
      );
      yield* reactAll(storage, [
        reacting(first.id, "bob"),
        reacting(second.id, "cat"),
        { ...reacting(second.id, "ann"), notifiesAuthor: false },
        reacting(bobs.id, "cat"),
      ]);
      const before = yield* storage.listUnseenReactions(nameOf("ann"));
      yield* storage.markReactionsSeen(nameOf("ann"), [first.id, bobs.id]);
      const after = yield* storage.listUnseenReactions(nameOf("ann"));
      const bobsUnseen = yield* storage.listUnseenReactions(nameOf("bob"));

      expect({ after, before, bobsUnseen }).toMatchObject({
        after: [{ identity: "cat", messageId: second.id }],
        before: [
          { identity: "bob", messageId: first.id },
          { identity: "cat", messageId: second.id },
        ],
        bobsUnseen: [{ identity: "cat", messageId: bobs.id }],
      });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): reacting again after a removal notifies the author again",
  ({ layer }) =>
    Effect.gen(function* reactAgain() {
      const storage = yield* storeWithPeople(layer);
      const message = yield* appendTo(storage)(newMessage("grill", "ship it?", ANN));
      yield* storage.addReaction(reacting(message.id, "bob"));
      yield* storage.markReactionsSeen(nameOf("ann"), [message.id]);
      yield* storage.removeReaction(reacting(message.id, "bob"));
      yield* storage.addReaction({ ...reacting(message.id, "bob"), reactedAt: LATER });
      const unseen = yield* storage.listUnseenReactions(nameOf("ann"));

      expect(unseen).toStrictEqual([
        { identity: "bob", messageId: message.id, reactedAt: LATER, reaction: "thumbs_up" },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): deleting an identity deletes its reactions, and deleting a channel its messages' reactions",
  ({ layer }) =>
    Effect.gen(function* cascade() {
      const storage = yield* storeWithPeople(layer);
      yield* storage.createChannel(channel("other"));
      const post = appendTo(storage);
      const [message, elsewhere] = yield* Effect.all(
        [post(newMessage("grill", "ship it?", ANN)), post(newMessage("other", "and this?", ANN))],
        ONE_AT_A_TIME,
      );
      yield* reactAll(storage, [
        reacting(message.id, "bob"),
        reacting(message.id, "cat"),
        reacting(elsewhere.id, "cat"),
      ]);
      yield* storage.deleteIdentity(nameOf("bob"));
      const afterIdentity = yield* storage.listReactions([message.id, elsewhere.id]);
      yield* storage.deleteChannel(channelName("other"));
      const afterChannel = yield* storage.listReactions([message.id, elsewhere.id]);

      expect({ afterChannel, afterIdentity }).toMatchObject({
        afterChannel: [{ identity: "cat", messageId: message.id }],
        afterIdentity: [
          { identity: "cat", messageId: message.id },
          { identity: "cat", messageId: elsewhere.id },
        ],
      });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): listing the reactions of no messages finds none",
  ({ layer }) =>
    Effect.gen(function* listNone() {
      const storage = yield* storeWithPeople(layer);
      const message = yield* appendTo(storage)(newMessage("grill", "ship it?", ANN));
      yield* reactAll(storage, [reacting(message.id, "bob")]);
      const listed = yield* storage.listReactions([]);

      expect(listed).toStrictEqual([]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): marking the reactions of no messages seen leaves every reaction unseen",
  ({ layer }) =>
    Effect.gen(function* markNone() {
      const storage = yield* storeWithPeople(layer);
      const message = yield* appendTo(storage)(newMessage("grill", "ship it?", ANN));
      yield* reactAll(storage, [reacting(message.id, "bob")]);
      yield* storage.markReactionsSeen(nameOf("ann"), []);
      const unseen = yield* storage.listUnseenReactions(nameOf("ann"));

      expect(unseen).toMatchObject([{ identity: "bob", messageId: message.id }]);
    }),
);
