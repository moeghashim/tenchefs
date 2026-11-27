import { Array as Arr, Effect, Exit, FileSystem, Option, String as Str, pipe } from "effect";
import { StorageUnavailable, sqliteStorage } from "../../server.ts";
import {
  appendTo,
  channelFixture,
  freshDatabasePath,
  handlerFixture,
  identityFixture,
  identityName,
  isoTime,
  newMessageFixture,
  openStore,
  testSecretsCipher,
  webhookCommandFixture,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { MessageId } from "../../../messages/index.ts";
import { NodeServices } from "@effect/platform-node";
import type { StoredThread } from "../../server.ts";
import { tokenHash } from "../../../identities/index.ts";

type OnDisk<Value> = Effect.Effect<Value, StorageUnavailable, FileSystem.FileSystem>;

const HASH_LENGTH = 64;
const REOPENS = 3;
const ONE_REPLY = 1;
const OCTAL = 8;
const PERMISSION_DIGITS = -3;
const OWNER_ONLY = "600";
const FIRST = 0;
const SCHEMA_VERSION_OFFSET = 60;
const SCHEMA_VERSION_BYTES = 4;
const NEWER_VERSION = 1000;
const NEGATIVE_VERSION = -1;
const MEMORY_FOLDER = "/dev/shm";
const hashA = tokenHash(Str.repeat(HASH_LENGTH)("a"));
const hashB = tokenHash(Str.repeat(HASH_LENGTH)("b"));
const hashC = tokenHash(Str.repeat(HASH_LENGTH)("c"));
const griller = identityFixture("auth-griller", { owner: "matt" });
const matt = identityFixture("matt", { kind: "human" });

function permissions(mode: number): string {
  return Str.slice(PERMISSION_DIGITS)(mode.toString(OCTAL));
}

function openAndClose(path: string): OnDisk<void> {
  return Effect.gen(function* openCheckClose() {
    const { close, storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    yield* storage.checkHealth();
    yield* close;
  });
}

function createThenRotate(path: string): OnDisk<void> {
  return Effect.gen(function* seedAndClose() {
    const { close, storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    yield* storage.createIdentity(matt, hashC);
    yield* storage.createIdentity(griller, hashA);
    yield* storage.replaceToken(identityName("auth-griller"), hashB);
    yield* close;
  });
}

function postTwo(path: string): OnDisk<MessageId> {
  return Effect.gen(function* postTwoAndClose() {
    const { close, storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    yield* storage.createChannel(channelFixture("grill"));
    yield* appendTo(storage)(newMessageFixture("grill", "first"));
    const last = yield* appendTo(storage)(newMessageFixture("grill", "second"));
    yield* close;
    return last.id;
  });
}

function asText(bytes: Iterable<number>): string {
  return Arr.join(
    Arr.map(Arr.fromIterable(bytes), (byte) => String.fromCodePoint(byte)),
    "",
  );
}

function asBytes(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => Option.getOrElse(Str.codePointAt(FIRST)(char), () => FIRST));
}

function damage(path: string, edit: (file: string) => string): OnDisk<void> {
  return Effect.gen(function* rewriteFile() {
    const fs = yield* FileSystem.FileSystem;
    const file = yield* fs.readFile(path);
    const edited = edit(asText(file));
    yield* fs.writeFile(path, asBytes(edited));
  }).pipe(Effect.catchTag("PlatformError", Effect.die));
}

function schemaVersion(version: number): (file: string) => string {
  const field = new Uint8Array(SCHEMA_VERSION_BYTES);
  new DataView(field.buffer).setInt32(FIRST, version);
  return (file) =>
    Str.slice(FIRST, SCHEMA_VERSION_OFFSET)(file) +
    asText(field) +
    Str.slice(SCHEMA_VERSION_OFFSET + SCHEMA_VERSION_BYTES)(file);
}

function upperCased(word: string): (file: string) => string {
  return (file) => Str.replaceAll(word, Str.toUpperCase(word))(file);
}

function postThread(path: string): OnDisk<StoredThread | undefined> {
  return Effect.gen(function* postAndClose() {
    const { close, storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    yield* storage.createChannel(channelFixture("grill", { description: "d" }));
    const parent = yield* appendTo(storage)(newMessageFixture("grill", "p", { author: { name: "a" }, data: null }));
    yield* appendTo(storage)(
      newMessageFixture("grill", "r", { author: { name: "b", owner: "matt" }, replyTo: parent.id }),
    );
    const thread = yield* storage.getThread(parent.id);
    yield* close;
    return thread;
  });
}

it.effect("a new database, its WAL and its shared-memory file are readable by their owner only", () =>
  Effect.gen(function* ownerOnlyFiles() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* freshDatabasePath;
    const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    yield* storage.createChannel(channelFixture("grill"));
    const files = [path, `${path}-wal`, `${path}-shm`];
    const infos = yield* Effect.forEach(files, (file) => fs.stat(file), { concurrency: 1 });

    expect(Arr.map(infos, ({ mode }) => permissions(mode))).toStrictEqual([OWNER_ONLY, OWNER_ONLY, OWNER_ONLY]);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect(
  "a test's database is made in memory, under /dev/shm, wherever the machine has it, so a busy disk can't stall it",
  () =>
    Effect.gen(function* inMemoryFolder() {
      const fs = yield* FileSystem.FileSystem;
      const machineHasIt = yield* fs.exists(MEMORY_FOLDER);
      const path = yield* freshDatabasePath;

      expect(Str.startsWith(`${MEMORY_FOLDER}/`)(path)).toBe(machineHasIt);
    }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("a database file that can't be created fails with StorageUnavailable", () =>
  Effect.gen(function* uncreatable() {
    const path = yield* freshDatabasePath;
    const error = yield* Effect.flip(
      openStore(sqliteStorage({ cipher: testSecretsCipher, path: `${path}/missing-folder/cookout.db` })),
    );

    expect(error).toBeInstanceOf(StorageUnavailable);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("a database at a newer schema version than this cookout fails with StorageUnavailable", () =>
  Effect.gen(function* tooNewSchema() {
    const path = yield* freshDatabasePath;
    yield* openAndClose(path);
    yield* damage(path, schemaVersion(NEWER_VERSION));
    const error = yield* Effect.flip(openStore(sqliteStorage({ cipher: testSecretsCipher, path })));

    expect(error).toStrictEqual(
      StorageUnavailable.make({
        message: "The database is at schema version 1000, newer than this cookout (4). Upgrade cookout.",
      }),
    );
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("a database with a negative schema version fails with StorageUnavailable", () =>
  Effect.gen(function* negativeSchema() {
    const path = yield* freshDatabasePath;
    yield* openAndClose(path);
    yield* damage(path, schemaVersion(NEGATIVE_VERSION));
    const error = yield* Effect.flip(openStore(sqliteStorage({ cipher: testSecretsCipher, path })));

    expect(error).toStrictEqual(StorageUnavailable.make({ message: "The database has no readable schema version." }));
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("a damaged channel row fails with StorageUnavailable when it is read", () =>
  Effect.gen(function* damagedRow() {
    const path = yield* freshDatabasePath;
    yield* postTwo(path);
    yield* damage(path, upperCased("grill"));
    const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    const error = yield* Effect.flip(storage.listChannels());

    expect(error).toStrictEqual(
      StorageUnavailable.make({ message: "The database holds a row this cookout can't read." }),
    );
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("a damaged identity row fails with StorageUnavailable when it is read", () =>
  Effect.gen(function* damagedIdentity() {
    const path = yield* freshDatabasePath;
    yield* createThenRotate(path);
    yield* damage(path, upperCased("auth-griller"));
    const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    const error = yield* Effect.flip(storage.listIdentities());

    expect(error).toStrictEqual(
      StorageUnavailable.make({ message: "The database holds a row this cookout can't read." }),
    );
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("message IDs keep increasing after the database is reopened", () =>
  Effect.gen(function* idsAfterReopen() {
    const path = yield* freshDatabasePath;
    const lastBeforeClose = yield* postTwo(path);
    const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    const next = yield* appendTo(storage)(newMessageFixture("grill", "third"));

    expect(next.id).toBeGreaterThan(lastBeforeClose);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("a message is stamped after the latest one, even after the database is reopened", () =>
  Effect.gen(function* timesAfterReopen() {
    const path = yield* freshDatabasePath;
    yield* postTwo(path);
    const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    const earlier = { ...newMessageFixture("grill", "third"), createdAt: isoTime("2025-12-31T23:59:59.000Z") };
    const next = yield* appendTo(storage)(earlier);

    expect(next.createdAt).toBe(isoTime("2026-01-01T00:00:00.002Z"));
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("channels, messages and threads are kept after the database is reopened", () =>
  Effect.gen(function* threadsAfterReopen() {
    const path = yield* freshDatabasePath;
    const before = yield* postThread(path);
    const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    const channels = yield* storage.listChannels();
    const after = yield* storage.getThread(Option.getOrThrow(Option.fromNullishOr(before)).parent.id);

    expect(channels).toStrictEqual([channelFixture("grill", { description: "d" })]);
    expect(after).toStrictEqual(before);
    expect(after).toMatchObject({ parent: { data: null, replyCount: ONE_REPLY }, replies: [{ text: "r" }] });
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("an existing database opens again without losing its data", () =>
  Effect.gen(function* reopenDatabase() {
    const path = yield* freshDatabasePath;
    yield* pipe(
      Arr.makeBy(REOPENS, () => path),
      Effect.forEach(openAndClose, { concurrency: 1 }),
    );
    const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    const health = yield* Effect.exit(storage.checkHealth());

    expect(Exit.isSuccess(health)).toBe(true);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("identities and token hashes are kept after the database is reopened", () =>
  Effect.gen(function* keptAfterReopen() {
    const path = yield* freshDatabasePath;
    yield* createThenRotate(path);
    const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    const identities = yield* storage.listIdentities();
    const oldHash = yield* storage.findIdentityByTokenHash(hashA);
    const newHash = yield* storage.findIdentityByTokenHash(hashB);

    expect(identities).toStrictEqual([griller, matt]);
    expect(oldHash).toStrictEqual({ status: "revoked" });
    expect(newHash).toStrictEqual({ identity: griller, status: "active" });
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("an agent without an owner is refused by the database, and nothing is stored", () =>
  Effect.gen(function* ownerless() {
    const path = yield* freshDatabasePath;
    const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    const handler = handlerFixture("ownerless");
    Reflect.set(handler, "owner", null);
    const error = yield* Effect.flip(storage.addWebhookCommand(webhookCommandFixture("ownerless"), handler));
    const identities = yield* storage.listIdentities();
    const commands = yield* storage.listWebhookCommands;

    expect(error).toBeInstanceOf(StorageUnavailable);
    expect({ commands, identities }).toStrictEqual({ commands: [], identities: [] });
  }).pipe(Effect.provide(NodeServices.layer)),
);
