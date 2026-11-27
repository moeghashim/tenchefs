import { Effect, FileSystem, Path } from "effect";
import { expect, it } from "@effect/vitest";
import { freshDatabasePath, messageId, openStore, testSecretsCipher } from "../../../testing/server.ts";
import { NodeServices } from "@effect/platform-node";
import { sqliteStorage } from "../../server.ts";

const BEFORE_READ_RECEIPTS = new URL("fixtures/before-read-receipts.db", import.meta.url);
const FIRST_MESSAGE = 1;
const SECOND_MESSAGE = 2;
const MENTION = messageId(FIRST_MESSAGE);
const REPLY = messageId(SECOND_MESSAGE);

const copiedDatabase = Effect.gen(function* copyFixture() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fixture = yield* path.fromFileUrl(BEFORE_READ_RECEIPTS);
  const copy = yield* freshDatabasePath;
  yield* fs.copyFile(fixture, copy);
  return copy;
}).pipe(Effect.orDie);

it.effect("the read receipts backfill marks the messages read positions already passed as seen, with no time", () =>
  Effect.gen(function* backfill() {
    const path = yield* copiedDatabase;
    const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));

    const receipts = yield* storage.listReadReceipts([MENTION, REPLY]);

    expect(receipts).toStrictEqual([
      { identity: "bob", messageId: MENTION, seen: true },
      { identity: "ann", messageId: REPLY, seen: true },
    ]);
  }).pipe(Effect.provide(NodeServices.layer)),
);
