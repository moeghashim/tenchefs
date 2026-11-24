import { Array as Arr, Effect, Option, String as Str, pipe } from "effect";
import type { Message, MessageId } from "../../../messages/index.ts";
import type { Storage, StorageUnavailable } from "../../../storage/server.ts";
import {
  appendTo,
  channelFixture as channel,
  fixtureTime,
  identityFixture as identity,
  identityName as nameOf,
  newMessageFixture as newMessage,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Layer } from "effect";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const AT_ONCE = 20;
const ALL_AT_ONCE = { concurrency: "unbounded" } as const;
const ANN = { author: { name: "ann" }, mentions: ["bob"] } as const;
const PEOPLE = [
  ["ann", "a"],
  ["bob", "b"],
] as const;

function storeWithPeople<Failure, Needs>(
  layer: Layer.Layer<Storage, Failure, Needs>,
): Effect.Effect<Storage["Service"], Failure | StorageUnavailable, Needs> {
  return Effect.gen(function* createPeople() {
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

function idsIn(items: readonly { readonly message: Message }[]): readonly MessageId[] {
  return Arr.map(items, (item) => item.message.id);
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): the inbox after a message ID holds only the items posted after it",
  ({ layer }) =>
    Effect.gen(function* inboxAfter() {
      const storage = yield* storeWithPeople(layer);
      const append = appendTo(storage);
      const first = yield* append(newMessage("grill", "@bob one", ANN));
      const second = yield* append(newMessage("grill", "@bob two", ANN));
      const third = yield* append(newMessage("grill", "@bob three", ANN));
      const after = yield* storage.listInboxAfter(nameOf("bob"), first.id);
      const afterAll = yield* storage.listInboxAfter(nameOf("bob"), third.id);

      expect(idsIn(after)).toStrictEqual([second.id, third.id]);
      expect(afterAll).toStrictEqual([]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): the inbox item of one message ID is that message's unread item, if it has one",
  ({ layer }) =>
    Effect.gen(function* inboxItemOfOne() {
      const storage = yield* storeWithPeople(layer);
      const append = appendTo(storage);
      const read = yield* append(newMessage("grill", "@bob read", ANN));
      yield* storage.ackMessage(nameOf("bob"), read.id, fixtureTime);
      const unread = yield* append(newMessage("grill", "@bob unread", ANN));
      const unrelated = yield* append(newMessage("grill", "no mention", { author: { name: "ann" } }));
      const found = yield* Effect.forEach(
        [read.id, unread.id, unrelated.id],
        (id) => storage.findInboxItem(nameOf("bob"), id),
        ONE_AT_A_TIME,
      );
      const own = yield* storage.findInboxItem(nameOf("ann"), unread.id);

      expect(Arr.map([...found, own], Option.fromUndefinedOr)).toStrictEqual([
        Option.none(),
        Option.some({ message: unread, parent: unread, reasons: ["mention"] }),
        Option.none(),
        Option.none(),
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): the inbox after a message ID never skips a smaller ID that commits later",
  ({ layer }) =>
    Effect.gen(function* noGapsWhileAppending() {
      const storage = yield* storeWithPeople(layer);
      const first = yield* appendTo(storage)(newMessage("grill", "@bob first", ANN));
      const append = appendTo(storage);
      const appends = Arr.makeBy(AT_ONCE, (index) => append(newMessage("grill", `@bob ${String(index)}`, ANN)));
      const inboxAfterFirst = Effect.map(storage.listInboxAfter(nameOf("bob"), first.id), idsIn);
      const reads = Arr.makeBy(AT_ONCE, () => inboxAfterFirst);
      const [, seen] = yield* Effect.all(
        [Effect.all(appends, ALL_AT_ONCE), Effect.all(reads, ALL_AT_ONCE)],
        ALL_AT_ONCE,
      );
      const every = yield* inboxAfterFirst;

      expect(every).toHaveLength(AT_ONCE);
      expect(seen).toStrictEqual(Arr.map(seen, (ids) => Arr.take(every, ids.length)));
    }),
);
