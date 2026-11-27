import { Array as Arr, Effect, Order } from "effect";
import {
  ONE_AT_A_TIME,
  WEEK,
  ada,
  adaToken,
  agent,
  agentToken,
  approvedSession,
  bob,
  first,
  hashesOf,
  later,
  liveOf,
  made,
  requestsEnd,
  webSessionPastedWith,
  withPeople,
} from "./lineage-seeds.ts";
import { expect, it } from "@effect/vitest";
import { isoTime, openStore, storageLayers } from "../../../testing/server.ts";
import type { StorageUnavailable } from "../../server.ts";
import type { Store } from "./lineage-seeds.ts";
import { tokenHash } from "../../../identities/index.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

const LISTED_SESSIONS = 2;

const [pasted, approvedByPasted, approvedBySession, agentSession] = [
  tokenHash("hash:pasted"),
  tokenHash("hash:approved-by-pasted"),
  tokenHash("hash:approved-by-session"),
  tokenHash("hash:agent-session"),
];

function madeWithTokens(storage: Store): Fails<void> {
  return Effect.gen(function* seedMadeWithTokens() {
    yield* withPeople(storage);
    yield* webSessionPastedWith({ hash: pasted, parent: adaToken, storage });
    yield* approvedSession({ approvedWith: pasted, hash: approvedByPasted, storage });
    yield* webSessionPastedWith({ hash: first, storage });
    yield* approvedSession({ approvedWith: first, hash: approvedBySession, storage });
    yield* storage.issueAgentSession({
      force: false,
      parent: agentToken,
      session: { expiresAt: requestsEnd, hash: agentSession, identity: agent.name, idleSeconds: WEEK, issuedAt: made },
    });
  });
}

function rotateBoth(storage: Store): Fails<void> {
  return Effect.all(
    [
      storage.replaceToken(ada.name, tokenHash("hash:ada-rotated")),
      storage.replaceToken(agent.name, tokenHash("hash:agent-rotated")),
    ],
    { ...ONE_AT_A_TIME, discard: true },
  );
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): rotating a token revokes what was made with it and what that approved, and nothing else",
  ({ layer }) =>
    Effect.gen(function* rotationCascades() {
      const { storage } = yield* openStore(layer);
      yield* madeWithTokens(storage);
      const beforeRotation = yield* storage.revokeBelowRevokedTokens(ada.name, later);
      yield* rotateBoth(storage);
      const person = yield* storage.revokeBelowRevokedTokens(ada.name, later);
      const agentEnded = yield* storage.revokeBelowRevokedTokens(agent.name, later);
      const again = yield* storage.revokeBelowRevokedTokens(ada.name, later);
      const live = yield* liveOf({
        hashes: [pasted, approvedByPasted, first, approvedBySession, agentSession],
        storage,
      });

      expect({ again, agentEnded, beforeRotation, live, person: hashesOf(person) }).toStrictEqual({
        again: [],
        agentEnded: [{ hash: agentSession, identity: agent.name, kind: "agent session" }],
        beforeRotation: [],
        live: [false, false, true, true, false],
        person: Arr.sort([pasted, approvedByPasted], Order.String),
      });
    }),
);

function sessionsWithOneLoggedOut(storage: Store): Fails<void> {
  return Effect.gen(function* seedSessions() {
    yield* withPeople(storage);
    yield* webSessionPastedWith({ hash: pasted, parent: adaToken, storage });
    yield* approvedSession({ approvedWith: pasted, hash: approvedByPasted, now: later, storage });
    yield* approvedSession({ approvedWith: approvedByPasted, hash: first, now: later, storage });
    yield* storage.revokeLoginCredential(first, later);
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): a person's sessions are listed live only, with the current one and what made each",
  ({ layer }) =>
    Effect.gen(function* listSessions() {
      const { storage } = yield* openStore(layer);
      yield* sessionsWithOneLoggedOut(storage);
      const listed = yield* storage.listSessions({ current: approvedByPasted, identity: ada.name, now: later });
      const bobs = yield* storage.listSessions({ current: approvedByPasted, identity: bob.name, now: later });
      const ids = Arr.map(listed, ({ id }) => id);

      expect(bobs).toStrictEqual([]);
      expect(new Set(ids).size).toBe(LISTED_SESSIONS);
      expect(Arr.map(listed, ({ id: _id, ...rest }) => rest)).toStrictEqual([
        {
          current: false,
          expiresAt: isoTime("2026-04-01T00:00:00.000Z"),
          kind: "web",
          lastUsedAt: made,
          madeAt: made,
          madeBy: { kind: "identity token" },
          where: "Firefox on macOS",
        },
        {
          current: true,
          expiresAt: isoTime("2026-04-01T00:05:00.000Z"),
          kind: "cli",
          lastUsedAt: later,
          madeAt: later,
          madeBy: { kind: "web", where: "Firefox on macOS" },
          where: `host of ${approvedByPasted}`,
        },
      ]);
    }),
);
