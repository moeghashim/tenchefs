import { Effect, String as Str } from "effect";
import type { FileSystem, Path, Scope } from "effect";
import { StorageUnavailable, sqliteStorage } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import {
  freshDatabasePath,
  identityFixture,
  identityName,
  openStore,
  otherSecretsCipher,
  plaintextCipher,
  testSecretsCipher,
  triggerToken,
} from "../../../testing/server.ts";
import { NodeServices } from "@effect/platform-node";
import type { SecretsCipher } from "../../../secrets/server.ts";
import type { Storage } from "../../server.ts";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const TRIAGE = identityName("triage");
const TRIGGER = { headers: [], token: triggerToken("routine-token-5d2a"), url: "https://routines.test/fire" };
const ada = identityFixture("ada", { kind: "human" });
const triage = identityFixture("triage", { owner: "ada" });
const hashA = tokenHash(Str.repeat(HASH_LENGTH)("a"));
const hashB = tokenHash(Str.repeat(HASH_LENGTH)("b"));

function triggerStoredWith(
  cipher: SecretsCipher,
): Effect.Effect<string, StorageUnavailable, FileSystem.FileSystem | Path.Path | Scope.Scope> {
  return Effect.gen(function* storeTrigger() {
    const path = yield* freshDatabasePath;
    const { close, storage } = yield* openStore(sqliteStorage({ cipher, path }));
    yield* storage.createIdentity(ada, hashA);
    yield* storage.createIdentity(triage, hashB);
    yield* storage.setTrigger(TRIAGE, TRIGGER);
    yield* close;
    return path;
  });
}

function reopenedWith(
  cipher: SecretsCipher,
  path: string,
): Effect.Effect<Storage["Service"], never, FileSystem.FileSystem> {
  const store = sqliteStorage({ cipher, path });
  return Effect.map(Effect.orDie(openStore(store)), ({ storage }) => storage);
}

it.effect("a trigger token left in plaintext, read without sealing it first, fails with StorageUnavailable", () =>
  Effect.gen(function* plaintextUnread() {
    const path = yield* triggerStoredWith(plaintextCipher);
    const storage = yield* reopenedWith(testSecretsCipher, path);
    const read = yield* Effect.flip(storage.findTrigger(TRIAGE));

    expect(read).toBeInstanceOf(StorageUnavailable);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("a trigger token sealed under another key fails with StorageUnavailable", () =>
  Effect.gen(function* otherKeyUnread() {
    const path = yield* triggerStoredWith(otherSecretsCipher);
    const storage = yield* reopenedWith(testSecretsCipher, path);
    const read = yield* Effect.flip(storage.findTrigger(TRIAGE));

    expect(read).toBeInstanceOf(StorageUnavailable);
  }).pipe(Effect.provide(NodeServices.layer)),
);
