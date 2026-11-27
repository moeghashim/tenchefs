import { DateTime, Effect } from "effect";
import type { Storage, StorageUnavailable } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import { identityFixture as identity, isoTime, openStore, storageLayers } from "../../../testing/server.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { TokenHash } from "../../../identities/index.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { tokenHash } from "../../../identities/index.ts";

const issued = isoTime("2026-01-01T00:00:00.000Z");
const ada = identity("ada", { kind: "human" });
const adaToken = tokenHash("hash:ada");
const credentialHash = tokenHash("hash:credential");
const DAY_1 = 1;
const DAY_89 = 89;
const DAY_90 = 90;
const DAY_91 = 91;
const DAY_178 = 178;
const DAY_179 = 179;

type Store = Storage["Service"];

function day(days: number): IsoTime {
  return isoTimeOf(DateTime.add(DateTime.makeUnsafe(issued), { days }));
}

function withAdaLoggedIn(storage: Store, hash: TokenHash): Effect.Effect<void, StorageUnavailable> {
  return Effect.gen(function* adaAndHerLogin() {
    yield* storage.createIdentity(ada, adaToken);
    yield* storage.issueLoginCredential({
      credentialHash: hash,
      host: "web",
      identity: ada.name,
      now: issued,
      parent: adaToken,
    });
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): a Login credential used at day 89 is still active at day 178",
  ({ layer }) =>
    Effect.gen(function* usedKeepsLiving() {
      const { storage } = yield* openStore(layer);
      yield* withAdaLoggedIn(storage, credentialHash);
      const used = yield* storage.useLoginCredential({ hash: credentialHash, now: day(DAY_89) });
      const later = yield* storage.useLoginCredential({ hash: credentialHash, now: day(DAY_178) });

      expect(used).toStrictEqual({
        expiresAt: day(DAY_179),
        identity: ada,
        lastUsedAt: day(DAY_89),
        status: "active",
      });
      expect(later).toStrictEqual({
        expiresAt: day(DAY_178 + DAY_90),
        identity: ada,
        lastUsedAt: day(DAY_178),
        status: "active",
      });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a Login credential unused for 90 days is answered as expired, then as unknown like a hash never issued",
  ({ layer }) =>
    Effect.gen(function* unusedExpires() {
      const { storage } = yield* openStore(layer);
      yield* withAdaLoggedIn(storage, credentialHash);
      const checked = yield* storage.checkLoginCredential({ hash: credentialHash, now: day(DAY_90) });
      const expired = yield* storage.useLoginCredential({ hash: credentialHash, now: day(DAY_90) });
      const again = yield* storage.useLoginCredential({ hash: credentialHash, now: day(DAY_90) });
      const never = yield* storage.useLoginCredential({ hash: tokenHash("hash:never"), now: day(DAY_90) });

      expect([checked, expired, again, never]).toStrictEqual([
        { status: "expired" },
        { status: "expired" },
        { status: "unknown" },
        { status: "unknown" },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): each use moves last used and expiry on, expiry 90 days after last used",
  ({ layer }) =>
    Effect.gen(function* eachUseRenews() {
      const { storage } = yield* openStore(layer);
      yield* withAdaLoggedIn(storage, credentialHash);
      const fresh = yield* storage.checkLoginCredential({ hash: credentialHash, now: issued });
      yield* storage.useLoginCredential({ hash: credentialHash, now: day(DAY_1) });
      const checked = yield* storage.checkLoginCredential({ hash: credentialHash, now: day(DAY_89) });
      const stillActive = yield* storage.checkLoginCredential({ hash: credentialHash, now: day(DAY_90) });
      const gone = yield* storage.checkLoginCredential({ hash: credentialHash, now: day(DAY_91) });

      expect(fresh).toStrictEqual({ expiresAt: day(DAY_90), identity: ada, lastUsedAt: issued, status: "active" });
      expect(checked).toStrictEqual({
        expiresAt: day(DAY_91),
        identity: ada,
        lastUsedAt: day(DAY_1),
        status: "active",
      });
      expect([stillActive.status, gone.status]).toStrictEqual(["active", "expired"]);
    }),
);
