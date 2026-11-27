import { Array as Arr, DateTime, Effect, FileSystem, Option, Order, Path } from "effect";
import type { Storage, StorageUnavailable } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import { freshDatabasePath, identityName, openStore, testSecretsCipher } from "../../../testing/server.ts";
import type { IsoTime } from "../../../time/index.ts";
import { NodeServices } from "@effect/platform-node";
import type { TokenHash } from "../../../identities/index.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { sqliteStorage } from "../../server.ts";
import { tokenHash } from "../../../identities/index.ts";

const BEFORE_LOGIN_EXPIRY = new URL("fixtures/before-login-expiry.db", import.meta.url);
const stored = tokenHash("hash:before-the-upgrade");
const ada = identityName("ada");
const linkHash = tokenHash("hash:link");
const redeemed = tokenHash("hash:redeemed");
const FIFTEEN_MINUTES = 15;

type Store = Storage["Service"];

const copiedDatabase = Effect.gen(function* copyFixture() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fixture = yield* path.fromFileUrl(BEFORE_LOGIN_EXPIRY);
  const copy = yield* freshDatabasePath;
  yield* fs.copyFile(fixture, copy);
  return copy;
}).pipe(Effect.orDie);

const soon = Effect.map(DateTime.now, (today) => isoTimeOf(DateTime.add(today, { minutes: 1 })));

function linkRedeemedThenRevoked(
  storage: Store,
  now: IsoTime,
): Effect.Effect<readonly TokenHash[], StorageUnavailable> {
  return Effect.gen(function* linkBelowStoredSession() {
    const expiresAt = isoTimeOf(DateTime.add(DateTime.makeUnsafe(now), { minutes: FIFTEEN_MINUTES }));
    yield* storage.addLoginLink({ createdAt: now, expiresAt, identity: ada, linkHash, parent: stored });
    yield* storage.redeemLoginLink({ credentialHash: redeemed, host: "Firefox on macOS", linkHash, now });
    const sessions = yield* storage.listSessions({ current: stored, identity: ada, now });
    const id = Option.getOrThrow(
      Option.map(
        Arr.findFirst(sessions, ({ current }) => current),
        ({ id: found }) => found,
      ),
    );
    const revoked = yield* storage.revokeSession({ id, identity: ada, now });
    if (revoked.status === "revoked") {
      return Arr.sort(
        Arr.map(revoked.ended, ({ hash }) => hash),
        Order.String,
      );
    }
    return [];
  });
}

it.live(
  "a session stored on SQLite before login links makes a link, and revoking it ends the session redeemed from it",
  () =>
    Effect.gen(function* upgradeSqlite() {
      const { storage } = yield* Effect.flatMap(copiedDatabase, (path) =>
        openStore(sqliteStorage({ cipher: testSecretsCipher, path })),
      );
      const now = yield* soon;
      const ended = yield* linkRedeemedThenRevoked(storage, now);

      expect(ended).toStrictEqual([stored, redeemed]);
    }).pipe(Effect.provide(NodeServices.layer)),
);
