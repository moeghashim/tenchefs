import { Array as Arr, DateTime, Effect, FileSystem, Path } from "effect";
import { expect, it } from "@effect/vitest";
import { freshDatabasePath, identityName, openStore, testSecretsCipher } from "../../../testing/server.ts";
import { NodeServices } from "@effect/platform-node";
import { isoTimeOf } from "../../../time/server.ts";
import { sqliteStorage } from "../../server.ts";
import { tokenHash } from "../../../identities/index.ts";

const BEFORE_LOGIN_EXPIRY = new URL("fixtures/before-login-expiry.db", import.meta.url);
const stored = tokenHash("hash:before-the-upgrade");
const ada = identityName("ada");
const ONE_DAY = 1;
const PUBLIC_ID = /^[0-9a-f]{16}$/u;

const storedLogin = {
  current: true,
  kind: "cli",
  madeAt: "2026-01-01T00:00:00.000Z",
  madeBy: { kind: "identity token" },
  where: "ada-laptop",
};

const copiedDatabase = Effect.gen(function* copyFixture() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fixture = yield* path.fromFileUrl(BEFORE_LOGIN_EXPIRY);
  const copy = yield* freshDatabasePath;
  yield* fs.copyFile(fixture, copy);
  return copy;
}).pipe(Effect.orDie);

it.live(
  "a Login credential stored on SQLite before lineage is a session made by its Identity token, which rotating revokes",
  () =>
    Effect.gen(function* upgradeSqlite() {
      const { storage } = yield* Effect.flatMap(copiedDatabase, (path) =>
        openStore(sqliteStorage({ cipher: testSecretsCipher, path })),
      );
      const today = yield* DateTime.now;
      const now = isoTimeOf(DateTime.add(today, { days: ONE_DAY }));
      const listed = yield* storage.listSessions({ current: stored, identity: ada, now });
      yield* storage.replaceToken(ada, tokenHash("hash:ada-rotated"));
      const revoked = yield* storage.revokeBelowRevokedTokens(ada, now);
      const after = yield* storage.listSessions({ current: stored, identity: ada, now });

      expect(Arr.map(listed, ({ id, ...rest }) => ({ ...rest, id: PUBLIC_ID.test(id) }))).toMatchObject([
        { ...storedLogin, id: true },
      ]);
      expect(revoked).toStrictEqual([{ hash: stored, identity: ada, kind: "session" }]);
      expect(after).toStrictEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
);
