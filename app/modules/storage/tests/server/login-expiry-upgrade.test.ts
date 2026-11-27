import { DateTime, Effect, FileSystem, Path } from "effect";
import type { Storage, StorageUnavailable } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import { freshDatabasePath, identityFixture, openStore, testSecretsCipher } from "../../../testing/server.ts";
import type { IsoTime } from "../../../time/index.ts";
import { NodeServices } from "@effect/platform-node";
import { isoTimeOf } from "../../../time/server.ts";
import { sqliteStorage } from "../../server.ts";
import { tokenHash } from "../../../identities/index.ts";

const BEFORE_LOGIN_EXPIRY = new URL("fixtures/before-login-expiry.db", import.meta.url);
const stored = tokenHash("hash:before-the-upgrade");
const ada = identityFixture("ada", { kind: "human" });
const DAYS_UNUSED = 90;
const JUST_BEFORE = -1;
const AT_EXPIRY = 0;
const ONE_AT_A_TIME = { concurrency: 1 } as const;

interface Upgrade {
  readonly before: IsoTime;
  readonly after: IsoTime;
}

const now = Effect.map(DateTime.now, isoTimeOf);

function daysOn(at: IsoTime, seconds: number): IsoTime {
  return isoTimeOf(DateTime.add(DateTime.makeUnsafe(at), { days: DAYS_UNUSED, seconds }));
}

function upgradedAt(
  storage: Storage["Service"],
  { after, before }: Upgrade,
): Effect.Effect<readonly unknown[], StorageUnavailable> {
  return Effect.all(
    [
      storage.checkLoginCredential({ hash: stored, now: daysOn(after, AT_EXPIRY) }),
      storage.useLoginCredential({ hash: stored, now: daysOn(before, JUST_BEFORE) }),
    ],
    ONE_AT_A_TIME,
  );
}

function expectUsedAtTheUpgrade([late, used]: readonly unknown[], { before }: Upgrade): void {
  expect(late).toStrictEqual({ status: "expired" });
  expect(used).toMatchObject({
    identity: { name: ada.name },
    lastUsedAt: daysOn(before, JUST_BEFORE),
    status: "active",
  });
}

const copiedDatabase = Effect.gen(function* copyFixture() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fixture = yield* path.fromFileUrl(BEFORE_LOGIN_EXPIRY);
  const copy = yield* freshDatabasePath;
  yield* fs.copyFile(fixture, copy);
  return copy;
}).pipe(Effect.orDie);

it.live(
  "a Login credential stored on SQLite before login expiry authenticates after it, last used at the upgrade",
  () =>
    Effect.gen(function* upgradeSqlite() {
      const path = yield* copiedDatabase;
      const before = yield* now;
      const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
      const after = yield* now;
      const answers = yield* upgradedAt(storage, { after, before });

      expectUsedAtTheUpgrade(answers, { after, before });
    }).pipe(Effect.provide(NodeServices.layer)),
);
