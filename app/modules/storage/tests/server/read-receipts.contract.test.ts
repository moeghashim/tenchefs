import { Effect, String as Str, pipe } from "effect";
import type { Storage, StorageUnavailable } from "../../../storage/server.ts";
import {
  appendTo,
  channelFixture as channel,
  channelName,
  fixtureTime,
  identityFixture as identity,
  isoTime,
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
const LATER = isoTime("2026-01-01T00:05:00.000Z");
const THANKS_AT = isoTime("2026-01-01T00:00:00.002Z");
const ANN = { author: { name: "ann" } } as const;
const BOB = { author: { name: "bob" } } as const;
const PEOPLE = [
  ["ann", "a"],
  ["bob", "b"],
  ["cat", "c"],
] as const;

function storeWithPeople<Failure, Needs>(
  layer: Layer.Layer<Storage, Failure, Needs>,
): Effect.Effect<Storage["Service"], Failure | StorageUnavailable, Needs> {
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

it.effect.each(storageLayers)(
  "storage contract ($adapter): a read receipt is recorded once, with the time of the first ack that passes it",
  ({ layer }) =>
    Effect.gen(function* recordOnce() {
      const storage = yield* storeWithPeople(layer);
      const mention = yield* appendTo(storage)(newMessage("grill", "@bob look", { ...ANN, mentions: ["bob"] }));
      const plain = yield* appendTo(storage)(newMessage("grill", "plain", ANN));

      const first = yield* storage.ackMessage(nameOf("bob"), plain.id, fixtureTime);
      yield* storage.moveReadPositionBack(nameOf("bob"), mention.id);
      const again = yield* storage.ackMessage(nameOf("bob"), plain.id, LATER);
      const kept = yield* storage.listReadReceipts([mention.id, plain.id]);

      const seen = { identity: "bob", messageId: mention.id, seen: true, seenAt: fixtureTime };

      expect({ again, first, kept }).toMatchObject({
        again: { receipts: [] },
        first: { receipts: [seen] },
        kept: [seen],
      });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): Mark all as read and posting a reply record the read receipts their moves pass",
  ({ layer }) =>
    Effect.gen(function* ackAllAndReply() {
      const storage = yield* storeWithPeople(layer);
      const mention = yield* appendTo(storage)(newMessage("grill", "@bob look", { ...ANN, mentions: ["bob"] }));
      const reply = yield* appendTo(storage)(newMessage("grill", "an answer", { ...BOB, replyTo: mention.id }));

      const ackedAll = yield* storage.ackInbox(nameOf("bob"), mention.id, LATER);
      const posted = yield* storage.appendMessage(newMessage("grill", "thanks", { ...ANN, replyTo: mention.id }));
      const kept = yield* storage.listReadReceipts([mention.id, reply.id]);

      expect({ ackedAll: ackedAll.receipts, kept, posted }).toMatchObject({
        ackedAll: [{ identity: "bob", messageId: mention.id, seen: true, seenAt: LATER }],
        kept: [
          { identity: "bob", messageId: mention.id, seen: true, seenAt: LATER },
          { identity: "ann", messageId: reply.id, seen: true, seenAt: THANKS_AT },
        ],
        posted: { receipts: [{ identity: "ann", messageId: reply.id, seen: true, seenAt: THANKS_AT }] },
      });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): deleting a channel forgets its messages' read receipts",
  ({ layer }) =>
    Effect.gen(function* deleteForgets() {
      const storage = yield* storeWithPeople(layer);
      const mention = yield* appendTo(storage)(newMessage("grill", "@bob look", { ...ANN, mentions: ["bob"] }));
      yield* storage.ackMessage(nameOf("bob"), mention.id, fixtureTime);

      yield* storage.deleteChannel(channelName("grill"));
      const kept = yield* storage.listReadReceipts([mention.id]);

      expect(kept).toStrictEqual([]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): one message's read receipts are listed by identity, whatever order they were seen in",
  ({ layer }) =>
    Effect.gen(function* byIdentity() {
      const storage = yield* storeWithPeople(layer);
      const mention = yield* appendTo(storage)(
        newMessage("grill", "@ann @bob look", { author: { name: "cat" }, mentions: ["ann", "bob"] }),
      );
      yield* storage.ackMessage(nameOf("bob"), mention.id, fixtureTime);
      yield* storage.ackMessage(nameOf("ann"), mention.id, LATER);

      const kept = yield* storage.listReadReceipts([mention.id]);

      expect(kept).toStrictEqual([
        { identity: "ann", messageId: mention.id, seen: true, seenAt: LATER },
        { identity: "bob", messageId: mention.id, seen: true, seenAt: fixtureTime },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): listing the read receipts of no messages finds none",
  ({ layer }) =>
    Effect.gen(function* noIds() {
      const storage = yield* storeWithPeople(layer);
      const plain = yield* appendTo(storage)(newMessage("grill", "plain", ANN));
      yield* storage.ackMessage(nameOf("bob"), plain.id, fixtureTime);
      const kept = yield* storage.listReadReceipts([]);

      expect(kept).toStrictEqual([]);
    }),
);
