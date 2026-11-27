import { Array as Arr, Effect, Order } from "effect";
import {
  UNKNOWN_ID,
  ada,
  adaToken,
  agent,
  agentSessionApprovedBy,
  approvedByFirst,
  approvedSession,
  bob,
  first,
  idOf,
  later,
  liveOf,
  longUnused,
  made,
  requestsEnd,
  revokedHashes,
  sibling,
  webSessionPastedWith,
  withPeople,
  workerSession,
} from "./lineage-seeds.ts";
import { expect, it } from "@effect/vitest";
import { openStore, storageLayers } from "../../../testing/server.ts";
import type { StorageUnavailable } from "../../server.ts";
import type { Store } from "./lineage-seeds.ts";
import { tokenHash } from "../../../identities/index.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

function treeBelowFirst(storage: Store): Fails<void> {
  return Effect.gen(function* seedTree() {
    yield* withPeople(storage);
    yield* approvedSession({ approvedWith: adaToken, hash: first, storage });
    yield* approvedSession({ approvedWith: adaToken, hash: sibling, storage });
    yield* approvedSession({ approvedWith: first, hash: approvedByFirst, storage });
    yield* agentSessionApprovedBy({ approvedWith: approvedByFirst, hash: workerSession, storage });
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): revoking a session ends the session and agent session it approved, and not its sibling",
  ({ layer }) =>
    Effect.gen(function* revokeCascades() {
      const { storage } = yield* openStore(layer);
      yield* treeBelowFirst(storage);
      const id = yield* idOf({ hash: first, storage });
      const revoked = yield* storage.revokeSession({ id, identity: ada.name, now: later });
      const live = yield* liveOf({ hashes: [first, approvedByFirst, workerSession, sibling], storage });

      expect(revoked.status).toBe("revoked");
      expect(revokedHashes(revoked)).toStrictEqual(Arr.sort([first, approvedByFirst, workerSession], Order.String));
      expect(live).toStrictEqual([false, false, false, true]);
    }),
);

const [middle, last] = [tokenHash("hash:middle"), tokenHash("hash:last")];

function descendantsBelowEndedOnes(storage: Store): Fails<void> {
  return Effect.gen(function* seedDescendants() {
    yield* withPeople(storage);
    yield* approvedSession({ approvedWith: adaToken, hash: first, now: longUnused, storage });
    yield* approvedSession({ approvedWith: first, hash: middle, now: longUnused, storage });
    yield* approvedSession({ approvedWith: middle, hash: last, now: longUnused, storage });
    yield* approvedSession({ approvedWith: first, hash: sibling, storage });
    yield* approvedSession({ approvedWith: sibling, hash: approvedByFirst, now: longUnused, storage });
    yield* storage.revokeLoginCredential(middle, longUnused);
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): revoking the top of a lineage reaches past a middle that logged out or expired",
  ({ layer }) =>
    Effect.gen(function* revokeThroughEnded() {
      const { storage } = yield* openStore(layer);
      yield* descendantsBelowEndedOnes(storage);
      const expired = yield* storage.useLoginCredential({ hash: sibling, now: longUnused });
      const id = yield* idOf({ hash: first, now: longUnused, storage });
      const revoked = yield* storage.revokeSession({ id, identity: ada.name, now: longUnused });
      const live = yield* liveOf({ hashes: [first, middle, last, sibling, approvedByFirst], now: longUnused, storage });

      expect(expired.status).toBe("expired");
      expect(revokedHashes(revoked)).toStrictEqual(Arr.sort([first, last, approvedByFirst], Order.String));
      expect(live).toStrictEqual([false, false, false, false, false]);
    }),
);

function twoTrees(storage: Store): Fails<void> {
  return Effect.gen(function* seedTwoTrees() {
    yield* withPeople(storage);
    yield* approvedSession({ approvedWith: adaToken, hash: first, storage });
    yield* approvedSession({ approvedWith: first, hash: approvedByFirst, now: longUnused, storage });
    yield* approvedSession({ approvedWith: adaToken, hash: sibling, storage });
    yield* approvedSession({ approvedWith: sibling, hash: last, now: longUnused, storage });
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): Log out and expiry end only their own session, and what it approved stays live",
  ({ layer }) =>
    Effect.gen(function* endsAlone() {
      const { storage } = yield* openStore(layer);
      yield* twoTrees(storage);
      const loggedOut = yield* storage.revokeLoginCredential(first, longUnused);
      const expired = yield* storage.useLoginCredential({ hash: sibling, now: longUnused });
      const live = yield* liveOf({ hashes: [first, approvedByFirst, sibling, last], now: longUnused, storage });

      expect([loggedOut, expired.status]).toStrictEqual([true, "expired"]);
      expect(live).toStrictEqual([false, true, false, true]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): another person's or an unknown session ID revokes nothing",
  ({ layer }) =>
    Effect.gen(function* revokeOthers() {
      const { storage } = yield* openStore(layer);
      yield* withPeople(storage);
      yield* approvedSession({ approvedWith: adaToken, hash: first, storage });
      const id = yield* idOf({ hash: first, storage });
      const asBob = yield* storage.revokeSession({ id, identity: bob.name, now: later });
      const unknown = yield* storage.revokeSession({ id: UNKNOWN_ID, identity: ada.name, now: later });
      const live = yield* liveOf({ hashes: [first], storage });

      expect([asBob, unknown]).toStrictEqual([{ status: "not_found" }, { status: "not_found" }]);
      expect(live).toStrictEqual([true]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): ending an identity's credentials ends what they approved for other identities",
  ({ layer }) =>
    Effect.gen(function* deactivationCascades() {
      const { storage } = yield* openStore(layer);
      yield* withPeople(storage);
      yield* approvedSession({ approvedWith: adaToken, hash: first, storage });
      yield* agentSessionApprovedBy({ approvedWith: first, hash: workerSession, storage });
      yield* storage.deactivateIdentity(ada.name);
      const ended = yield* storage.endCredentialsOf(ada.name, later);
      const live = yield* liveOf({ hashes: [first, workerSession], storage });

      expect(ended).toStrictEqual([{ hash: workerSession, identity: agent.name, kind: "agent session" }]);
      expect(live).toStrictEqual([false, false]);
    }),
);

const joinCode = tokenHash("hash:join-code");

it.effect.each(storageLayers)(
  "storage contract ($adapter): revoking a session ends the join code it made, which then joins no one",
  ({ layer }) =>
    Effect.gen(function* joinCodeEnds() {
      const { storage } = yield* openStore(layer);
      yield* withPeople(storage);
      yield* approvedSession({ approvedWith: adaToken, hash: first, storage });
      yield* storage.addJoinCode({
        agent: agent.name,
        codeHash: joinCode,
        createdAt: made,
        expiresAt: requestsEnd,
        parent: first,
      });
      const id = yield* idOf({ hash: first, storage });
      const revoked = yield* storage.revokeSession({ id, identity: ada.name, now: later });

      expect(revoked).toStrictEqual({
        ended: [
          { hash: first, identity: ada.name, kind: "session" },
          { hash: joinCode, identity: agent.name, kind: "join code" },
        ],
        status: "revoked",
      });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a session whose maker is not the person's own is listed with no madeBy",
  ({ layer }) =>
    Effect.gen(function* listedAlone() {
      const { storage } = yield* openStore(layer);
      yield* withPeople(storage);
      yield* webSessionPastedWith({ hash: first, storage });
      yield* webSessionPastedWith({ hash: sibling, parent: tokenHash("hash:bob"), storage });
      const listed = yield* storage.listSessions({ current: first, identity: ada.name, now: later });

      expect(Arr.map(listed, (session) => "madeBy" in session)).toStrictEqual([false, false]);
    }),
);
