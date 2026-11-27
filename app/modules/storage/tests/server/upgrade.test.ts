import { Array as Arr, Effect, FileSystem, Option, Path, String as Str } from "effect";
import { expect, it } from "@effect/vitest";
import {
  freshDatabasePath,
  identityName,
  isoTime,
  messageId,
  openStore,
  otherSecretsCipher,
  testSecretsCipher,
  triggerToken,
  webhookCommandName,
} from "../../../testing/server.ts";
import { NodeServices } from "@effect/platform-node";
import type { Scope } from "effect";
import type { StorageUnavailable } from "../../server.ts";
import { sqliteStorage } from "../../server.ts";

const AT_SCHEMA_VERSION_24 = "fixtures/before-closed-threads.db";
const AT_SCHEMA_VERSION_47 = "fixtures/before-call-times.db";
const BEFORE_SECRETS_KEY = "fixtures/before-secrets-key.db";
const PLAINTEXT_SECRETS = ["routine-token-5d2a", "header-secret-7e10", "hmac_deploy-secret-31c4"];
const TRIAGE = identityName("triage");
const DEPLOY = webhookCommandName("deploy");
const FIRST_MESSAGE = 1;
const PARENT = messageId(FIRST_MESSAGE);
const closing = { closedAt: isoTime("2026-11-23T23:00:00.000Z"), closedBy: identityName("matt") };

function copiedDatabase(
  fixtureFile: string,
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path | Scope.Scope> {
  return Effect.gen(function* copyFixture() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const fixture = yield* path.fromFileUrl(new URL(fixtureFile, import.meta.url));
    const copy = yield* freshDatabasePath;
    yield* fs.copyFile(fixture, copy);
    return copy;
  }).pipe(Effect.orDie);
}

it.effect(
  "a database at schema version 24, with a message and a reply, takes every later migration, keeps its rows and starts untitled",
  () =>
    Effect.gen(function* upgradeDeployed() {
      const path = yield* copiedDatabase(AT_SCHEMA_VERSION_24);
      const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));

      const closed = yield* storage.closeThread(PARENT, closing);
      const found = yield* storage.getThread(PARENT);
      const replies = Option.map(Option.fromUndefinedOr(found), (thread) =>
        Arr.map(thread.replies, ({ text }) => text),
      );

      expect(closed).toMatchObject({
        changed: true,
        parent: { ...closing, replyCount: 1, text: "before the upgrade" },
      });
      expect(replies).toStrictEqual(Option.some(["a reply"]));
      expect(closed).not.toHaveProperty("parent.title");
      expect(closed).not.toHaveProperty("parent.titleSetBy");
    }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect(
  "a database at schema version 47, with a pending delivery, takes every later migration and keeps its call time",
  () =>
    Effect.gen(function* upgradeDelivery() {
      const path = yield* copiedDatabase(AT_SCHEMA_VERSION_47);
      const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));

      const pending = yield* storage.listPendingDeliveries;

      expect(pending).toMatchObject([
        { attempts: 1, callId: "call_1", calledAt: "2026-01-01T00:00:00.000Z", outcome: "pending", threadId: PARENT },
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
);

function bytesOnDisk(database: string): Effect.Effect<string, never, FileSystem.FileSystem> {
  return Effect.gen(function* readDatabaseFiles() {
    const fs = yield* FileSystem.FileSystem;
    const files = yield* Effect.forEach(
      [database, `${database}-wal`],
      (file) =>
        Effect.map(
          Effect.option(fs.readFile(file)),
          Option.getOrElse(() => new Uint8Array()),
        ),
      { concurrency: 1 },
    );
    return Arr.join(
      Arr.map(files, (bytes) => Buffer.from(bytes).toString("latin1")),
      "",
    );
  });
}

function sealedOnce(path: string): Effect.Effect<string, StorageUnavailable, FileSystem.FileSystem> {
  return Effect.gen(function* sealWithTestKey() {
    const first = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    const sealed = yield* first.storage.sealSecrets;
    yield* first.close;
    return sealed;
  });
}

it.effect(
  "a database from before encryption, with a trigger and a Webhook command, has its secrets sealed by the first boot with a key and reads them back",
  () =>
    Effect.gen(function* sealBeforeSecretsKey() {
      const path = yield* copiedDatabase(BEFORE_SECRETS_KEY);
      const sealed = yield* sealedOnce(path);
      const onDisk = yield* bytesOnDisk(path);
      const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
      const { again, found, trigger } = yield* Effect.all(
        { again: storage.sealSecrets, found: storage.findWebhookCommand(DEPLOY), trigger: storage.findTrigger(TRIAGE) },
        { concurrency: 1 },
      );

      expect({ again, sealed }).toStrictEqual({ again: "unchanged", sealed: "sealed" });
      expect(Arr.filter(PLAINTEXT_SECRETS, (secret) => Str.includes(secret)(onDisk))).toStrictEqual([]);
      expect(trigger).toMatchObject({
        headers: [{ name: "x-routine-key", value: "header-secret-7e10" }],
        token: triggerToken("routine-token-5d2a"),
      });
      expect(found).toMatchObject({ secret: "hmac_deploy-secret-31c4" });
    }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("a database whose secrets were sealed with one key finds another key is not its own", () =>
  Effect.gen(function* otherKey() {
    const path = yield* copiedDatabase(BEFORE_SECRETS_KEY);
    yield* sealedOnce(path);
    const { storage } = yield* openStore(sqliteStorage({ cipher: otherSecretsCipher, path }));
    const result = yield* storage.sealSecrets;

    expect(result).toBe("other_key");
  }).pipe(Effect.provide(NodeServices.layer)),
);
