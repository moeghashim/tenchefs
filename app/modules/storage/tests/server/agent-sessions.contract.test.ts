import { Array as Arr, DateTime, Effect, String as Str } from "effect";
import type { Storage, StorageUnavailable } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import {
  identityFixture as identity,
  isoTime,
  identityName as nameOf,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import type { Layer } from "effect";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const T0 = isoTime("2026-01-01T00:00:00.000Z");
const T30 = isoTime("2026-01-01T00:00:30.000Z");
const T60 = isoTime("2026-01-01T00:01:00.000Z");
const T90 = isoTime("2026-01-01T00:01:30.000Z");
const T120 = isoTime("2026-01-01T00:02:00.000Z");
const IDLE_SECONDS = 60;
const AGENT = nameOf("agent");
const FIRST = tokenHash(Str.repeat(HASH_LENGTH)("1"));
const SECOND = tokenHash(Str.repeat(HASH_LENGTH)("2"));
const STRANGER = tokenHash(Str.repeat(HASH_LENGTH)("9"));
const ONE_AT_A_TIME = { concurrency: 1 } as const;

type IssueRequest = Parameters<Storage["Service"]["issueAgentSession"]> extends [infer Request] ? Request : never;
type StoredAgentSession = IssueRequest["session"];

function withAgent(
  layer: Layer.Layer<Storage, StorageUnavailable>,
): Effect.Effect<Storage["Service"], StorageUnavailable> {
  return Effect.gen(function* oneAgent() {
    const { storage } = yield* openStore(layer);
    yield* storage.createIdentity(identity("agent", { kind: "agent" }), tokenHash(Str.repeat(HASH_LENGTH)("a")));
    return storage;
  });
}

function session(hash: typeof FIRST, issuedAt = T0): StoredAgentSession {
  const expiry = DateTime.add(DateTime.makeUnsafe(issuedAt), { seconds: IDLE_SECONDS });
  const expiresAt = isoTime(DateTime.formatIso(expiry));
  return { expiresAt, hash, identity: AGENT, idleSeconds: IDLE_SECONDS, issuedAt };
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): an issued agent session token is active, and each use moves its expiry on",
  ({ layer }) =>
    Effect.gen(function* issueAndUse() {
      const storage = yield* withAgent(layer);
      const issued = yield* storage.issueAgentSession({ force: false, session: session(FIRST) });
      const used = yield* storage.useAgentSession({ hash: FIRST, now: T30 });
      const usedLater = yield* storage.useAgentSession({ hash: FIRST, now: T60 });

      expect(issued).toStrictEqual({ status: "issued" });
      expect(used).toMatchObject({ expiresAt: T90, identity: { name: AGENT }, status: "active" });
      expect(usedLater).toMatchObject({ expiresAt: T120, status: "active" });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent has one live agent session token: a second is refused unless forced",
  ({ layer }) =>
    Effect.gen(function* oneLive() {
      const storage = yield* withAgent(layer);
      yield* storage.issueAgentSession({ force: false, session: session(FIRST) });
      const refused = yield* storage.issueAgentSession({ force: false, session: session(SECOND, T30) });
      const forced = yield* storage.issueAgentSession({ force: true, session: session(SECOND, T30) });
      const uses = yield* Effect.all(
        [storage.useAgentSession({ hash: FIRST, now: T30 }), storage.useAgentSession({ hash: SECOND, now: T30 })],
        ONE_AT_A_TIME,
      );

      expect(refused).toStrictEqual({ expiresAt: T60, status: "live" });
      expect(forced).toStrictEqual({ status: "issued" });
      expect(uses).toMatchObject([{ status: "revoked" }, { status: "active" }]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a token unused until its expiry is expired, and no longer blocks a new one",
  ({ layer }) =>
    Effect.gen(function* expires() {
      const storage = yield* withAgent(layer);
      yield* storage.issueAgentSession({ force: false, session: session(FIRST) });
      const expired = yield* storage.useAgentSession({ hash: FIRST, now: T60 });
      const next = yield* storage.issueAgentSession({ force: false, session: session(SECOND, T60) });

      expect(expired).toStrictEqual({ status: "expired" });
      expect(next).toStrictEqual({ status: "issued" });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a revoked token stays revoked and frees the agent; an unknown hash is unknown",
  ({ layer }) =>
    Effect.gen(function* revokes() {
      const storage = yield* withAgent(layer);
      yield* storage.issueAgentSession({ force: false, session: session(FIRST) });
      yield* storage.revokeAgentSession(FIRST);
      const revoked = yield* storage.useAgentSession({ hash: FIRST, now: T30 });
      const next = yield* storage.issueAgentSession({ force: false, session: session(SECOND, T30) });
      const unknown = yield* storage.useAgentSession({ hash: STRANGER, now: T30 });

      expect(revoked).toStrictEqual({ status: "revoked" });
      expect(next).toStrictEqual({ status: "issued" });
      expect(unknown).toStrictEqual({ status: "unknown" });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): deactivating the agent revokes its agent session tokens, even once it is reactivated",
  ({ layer }) =>
    Effect.gen(function* deactivated() {
      const storage = yield* withAgent(layer);
      yield* storage.issueAgentSession({ force: false, session: session(FIRST) });
      yield* storage.deactivateIdentity(AGENT);
      const whileDeactivated = yield* storage.useAgentSession({ hash: FIRST, now: T30 });
      yield* storage.reactivateIdentity(AGENT, tokenHash("hash:fresh"));
      const afterwards = yield* storage.useAgentSession({ hash: FIRST, now: T30 });

      expect([whileDeactivated, afterwards]).toStrictEqual([{ status: "deactivated" }, { status: "revoked" }]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent session token used twice at once is used once at a time, to one expiry",
  ({ layer }) =>
    Effect.gen(function* usedOnce() {
      const storage = yield* withAgent(layer);
      yield* storage.issueAgentSession({ force: false, session: session(FIRST) });
      const uses = yield* Effect.all(
        [storage.useAgentSession({ hash: FIRST, now: T30 }), storage.useAgentSession({ hash: FIRST, now: T30 })],
        { concurrency: "unbounded" },
      );
      const listed = yield* storage.findLiveAgentSession({ identity: AGENT, now: T30 });

      expect(uses).toMatchObject([
        { expiresAt: T90, status: "active" },
        { expiresAt: T90, status: "active" },
      ]);
      expect(listed).toMatchObject({ value: { expiresAt: T90, lastUsedAt: T30 } });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): two agent session tokens issued at once without force, exactly one is issued",
  ({ layer }) =>
    Effect.gen(function* issuedOnce() {
      const storage = yield* withAgent(layer);
      const issues = yield* Effect.all(
        [
          storage.issueAgentSession({ force: false, session: session(FIRST) }),
          storage.issueAgentSession({ force: false, session: session(SECOND) }),
        ],
        { concurrency: "unbounded" },
      );
      const uses = yield* Effect.all(
        [storage.useAgentSession({ hash: FIRST, now: T30 }), storage.useAgentSession({ hash: SECOND, now: T30 })],
        ONE_AT_A_TIME,
      );

      expect(issues).toStrictEqual([{ status: "issued" }, { expiresAt: T60, status: "live" }]);
      expect(Arr.map(uses, ({ status }) => status)).toStrictEqual(["active", "unknown"]);
    }),
);
