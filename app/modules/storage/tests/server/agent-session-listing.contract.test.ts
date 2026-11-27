import { DateTime, Effect, Option, String as Str } from "effect";
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
const IDLE_SECONDS = 60;
const AGENT = nameOf("agent");
const OTHER = nameOf("other");
const FIRST = tokenHash(Str.repeat(HASH_LENGTH)("1"));
const SECOND = tokenHash(Str.repeat(HASH_LENGTH)("2"));
const ONE_AT_A_TIME = { concurrency: 1 } as const;

type IssueRequest = Parameters<Storage["Service"]["issueAgentSession"]> extends [infer Request] ? Request : never;
type StoredAgentSession = IssueRequest["session"];

function withAgents(
  layer: Layer.Layer<Storage, StorageUnavailable>,
): Effect.Effect<Storage["Service"], StorageUnavailable> {
  return Effect.gen(function* twoAgents() {
    const { storage } = yield* openStore(layer);
    yield* storage.createIdentity(identity("agent", { kind: "agent" }), tokenHash(Str.repeat(HASH_LENGTH)("a")));
    yield* storage.createIdentity(identity("other", { kind: "agent" }), tokenHash(Str.repeat(HASH_LENGTH)("b")));
    return storage;
  });
}

function session(hash: typeof FIRST, name = AGENT): StoredAgentSession {
  const expiry = DateTime.add(DateTime.makeUnsafe(T0), { seconds: IDLE_SECONDS });
  const expiresAt = isoTime(DateTime.formatIso(expiry));
  return { expiresAt, hash, identity: name, idleSeconds: IDLE_SECONDS, issuedAt: T0 };
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent's live agent session token is listed with its times and host, never its hash",
  ({ layer }) =>
    Effect.gen(function* listsLive() {
      const storage = yield* withAgents(layer);
      yield* storage.issueAgentSession({ force: false, session: { ...session(FIRST), host: "build-box" } });
      const fresh = yield* storage.findLiveAgentSession({ identity: AGENT, now: T0 });
      yield* storage.useAgentSession({ hash: FIRST, now: T30 });
      const used = yield* storage.findLiveAgentSession({ identity: AGENT, now: T30 });

      expect(fresh).toStrictEqual(Option.some({ expiresAt: T60, host: "build-box", issuedAt: T0 }));
      expect(used).toStrictEqual(Option.some({ expiresAt: T90, host: "build-box", issuedAt: T0, lastUsedAt: T30 }));
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent with no live agent session token, or only an expired one, lists none",
  ({ layer }) =>
    Effect.gen(function* listsNone() {
      const storage = yield* withAgents(layer);
      yield* storage.issueAgentSession({ force: false, session: session(FIRST) });
      const listed = yield* Effect.all(
        [
          storage.findLiveAgentSession({ identity: AGENT, now: T30 }),
          storage.findLiveAgentSession({ identity: OTHER, now: T30 }),
          storage.findLiveAgentSession({ identity: AGENT, now: T90 }),
        ],
        ONE_AT_A_TIME,
      );

      expect(listed).toStrictEqual([Option.some({ expiresAt: T60, issuedAt: T0 }), Option.none(), Option.none()]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): revoking an agent's live agent session token ends it and leaves other agents' alone",
  ({ layer }) =>
    Effect.gen(function* revokesLive() {
      const storage = yield* withAgents(layer);
      yield* storage.issueAgentSession({ force: false, session: session(FIRST) });
      yield* storage.issueAgentSession({ force: false, session: session(SECOND, OTHER) });
      const revoked = yield* Effect.all(
        [
          storage.revokeLiveAgentSession({ identity: AGENT, now: T30 }),
          storage.revokeLiveAgentSession({ identity: AGENT, now: T30 }),
        ],
        ONE_AT_A_TIME,
      );
      const used = yield* Effect.all(
        [storage.useAgentSession({ hash: FIRST, now: T30 }), storage.useAgentSession({ hash: SECOND, now: T30 })],
        ONE_AT_A_TIME,
      );
      const listed = yield* storage.findLiveAgentSession({ identity: AGENT, now: T30 });

      expect(revoked).toStrictEqual([[{ hash: FIRST, identity: AGENT, kind: "agent session" }], []]);
      expect(used).toMatchObject([{ status: "revoked" }, { status: "active" }]);
      expect(listed).toStrictEqual(Option.none());
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent session token is listed with the session URL it was issued with",
  ({ layer }) =>
    Effect.gen(function* listsSessionUrl() {
      const storage = yield* withAgents(layer);
      const sessionUrl = "https://claude.ai/code/session_1";
      yield* storage.issueAgentSession({ force: false, session: { ...session(FIRST), sessionUrl } });
      const listed = yield* storage.findLiveAgentSession({ identity: AGENT, now: T0 });

      expect(listed).toStrictEqual(Option.some({ expiresAt: T60, issuedAt: T0, sessionUrl }));
    }),
);
