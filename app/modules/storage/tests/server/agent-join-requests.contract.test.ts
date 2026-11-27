import { Effect, Predicate } from "effect";
import type { Storage, StorageUnavailable } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import { identityFixture as identity, isoTime, openStore, storageLayers } from "../../../testing/server.ts";
import { tokenHash } from "../../../identities/index.ts";

const created = isoTime("2026-01-01T00:00:00.000Z");
const before = isoTime("2026-01-01T00:05:00.000Z");
const expiresAt = isoTime("2026-01-01T00:10:00.000Z");
const after = isoTime("2026-01-01T00:10:00.001Z");
const sessionExpiry = isoTime("2026-01-08T00:05:00.000Z");
const requestHash = tokenHash("hash:request");
const sessionHash = tokenHash("hash:session");
const ada = identity("ada", { kind: "human" });
const agent = identity("triage-agent", { kind: "agent", owner: ada.name });
const WEEK = 604_800;
const FAILING_CALLS = 6;

const request = {
  agent: agent.name,
  createdAt: created,
  expiresAt,
  host: "build-box",
  idleExpiry: "30d",
  requestHash,
  userCode: "WDJB-MJHT",
};

const approval = { created: true, force: false, identity: agent.name, idleSeconds: WEEK };

type Store = Storage["Service"];

const later = {
  agent: agent.name,
  createdAt: before,
  expiresAt,
  host: "build-box",
  requestHash: tokenHash("hash:later"),
  userCode: "LATE-CODE",
};
const pendingOf = { agent: agent.name, host: "build-box" };

function withAgent(storage: Store): Effect.Effect<void, StorageUnavailable> {
  const adaCreated = storage.createIdentity(ada, tokenHash("hash:ada"));
  const agentCreated = storage.createIdentity(agent, tokenHash("hash:agent"));
  return Effect.asVoid(Effect.andThen(adaCreated, agentCreated));
}

function approvedTwice(storage: Store): Effect.Effect<void, StorageUnavailable> {
  const { idleExpiry: _asked, ...unasked } = request;
  return Effect.gen(function* addThenApproveTwice() {
    yield* storage.addAgentJoinRequest(unasked, created);
    yield* storage.approveAgentJoinRequest("WDJB-MJHT", approval, before);
    yield* storage.approveAgentJoinRequest("WDJB-MJHT", { ...approval, idleSeconds: 1 }, before);
  });
}

const live = { expiresAt: sessionExpiry, hash: tokenHash("hash:live"), identity: agent.name, idleSeconds: WEEK };

function withLiveSession(storage: Store): Effect.Effect<void, StorageUnavailable> {
  return Effect.gen(function* agentWithLiveSession() {
    yield* withAgent(storage);
    yield* storage.issueAgentSession({ force: false, session: { ...live, issuedAt: before } });
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent join request is found by its user code, pending until approved",
  ({ layer }) =>
    Effect.gen(function* pendingThenApproved() {
      const { storage } = yield* openStore(layer);
      const added = yield* storage.addAgentJoinRequest(request, created);
      const taken = yield* storage.addAgentJoinRequest({ ...request, requestHash: tokenHash("hash:other") }, before);
      const found = yield* storage.findAgentJoinRequest("WDJB-MJHT", before);
      const pending = yield* storage.collectAgentJoinRequest({ now: before, requestHash, sessionHash });
      const approved = yield* storage.approveAgentJoinRequest("WDJB-MJHT", approval, before);
      const shown = yield* storage.findAgentJoinRequest("WDJB-MJHT", before);
      const shownRequest = {
        agent: agent.name,
        createdAt: created,
        expiresAt,
        host: "build-box",
        idleExpiry: "30d",
        userCode: "WDJB-MJHT",
      };

      expect([added, taken, found, pending, approved, shown]).toStrictEqual([
        "added",
        "code_taken",
        { ...shownRequest, approved: false },
        { status: "pending" },
        "approved",
        { ...shownRequest, approved: true },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an approved agent join request is collected once, issuing an agent session token",
  ({ layer }) =>
    Effect.gen(function* collectOnce() {
      const { storage } = yield* openStore(layer);
      yield* withAgent(storage);
      yield* approvedTwice(storage);
      const shown = yield* storage.findAgentJoinRequest("WDJB-MJHT", before);
      const first = yield* storage.collectAgentJoinRequest({ now: before, requestHash, sessionHash });
      const second = yield* storage.collectAgentJoinRequest({ now: before, requestHash, sessionHash });
      const used = yield* storage.useAgentSession({ hash: sessionHash, now: before });

      expect(shown).toStrictEqual({
        agent: agent.name,
        approved: true,
        createdAt: created,
        expiresAt,
        host: "build-box",
        userCode: "WDJB-MJHT",
      });
      expect([first, second]).toStrictEqual([
        { created: true, expiresAt: sessionExpiry, identity: agent.name, issuedAt: before, status: "collected" },
        { status: "gone" },
      ]);
      expect(used).toMatchObject({ expiresAt: sessionExpiry, identity: { name: "triage-agent" }, status: "active" });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): collecting for an agent with a live agent session token replaces it only if forced",
  ({ layer }) =>
    Effect.gen(function* liveSession() {
      const { storage } = yield* openStore(layer);
      yield* withLiveSession(storage);
      yield* Effect.andThen(
        storage.addAgentJoinRequest(request, created),
        storage.approveAgentJoinRequest("WDJB-MJHT", approval, before),
      );
      const refused = yield* storage.collectAgentJoinRequest({ now: before, requestHash, sessionHash });
      const forcedHash = tokenHash("hash:forced");
      yield* storage.addAgentJoinRequest({ ...request, requestHash: forcedHash }, before);
      yield* storage.approveAgentJoinRequest("WDJB-MJHT", { ...approval, force: true }, before);
      const forced = yield* storage.collectAgentJoinRequest({ now: before, requestHash: forcedHash, sessionHash });
      const old = yield* storage.useAgentSession({ hash: live.hash, now: before });

      expect([refused, forced.status, old.status]).toStrictEqual([
        { expiresAt: sessionExpiry, identity: agent.name, status: "live" },
        "collected",
        "revoked",
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent join request past its expiry is gone, approved or not",
  ({ layer }) =>
    Effect.gen(function* expired() {
      const { storage } = yield* openStore(layer);
      yield* storage.addAgentJoinRequest(request, created);
      const found = yield* storage.findAgentJoinRequest("WDJB-MJHT", after);
      const approved = yield* storage.approveAgentJoinRequest("WDJB-MJHT", approval, after);
      const late = tokenHash("hash:late");
      yield* storage.addAgentJoinRequest({ ...request, requestHash: late, userCode: "LATE-CODE" }, created);
      yield* storage.approveAgentJoinRequest("LATE-CODE", approval, before);
      const collected = yield* storage.collectAgentJoinRequest({ now: after, requestHash: late, sessionHash });

      expect([Predicate.isObject(found), approved, collected]).toStrictEqual([false, "not_found", { status: "gone" }]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): the pending agent join requests are listed oldest first, until approved or expired",
  ({ layer }) =>
    Effect.gen(function* listPending() {
      const { storage } = yield* openStore(layer);
      yield* Effect.andThen(
        storage.addAgentJoinRequest({ ...later, expiresAt: sessionExpiry }, before),
        storage.addAgentJoinRequest(request, created),
      );
      const listed = yield* storage.listPendingAgentJoinRequests(before);
      yield* storage.approveAgentJoinRequest("LATE-CODE", approval, before);
      const approvedGone = yield* storage.listPendingAgentJoinRequests(before);
      yield* storage.addAgentJoinRequest(
        { ...later, requestHash: tokenHash("hash:third"), userCode: "NEXT-CODE" },
        before,
      );
      const expiredGone = yield* storage.listPendingAgentJoinRequests(after);

      expect([listed, approvedGone, expiredGone]).toStrictEqual([
        [
          { ...pendingOf, createdAt: created, expiresAt, userCode: "WDJB-MJHT" },
          { ...pendingOf, createdAt: before, expiresAt: sessionExpiry, userCode: "LATE-CODE" },
        ],
        [{ ...pendingOf, createdAt: created, expiresAt, userCode: "WDJB-MJHT" }],
        [],
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a closed store can't keep agent join requests",
  ({ layer }) =>
    Effect.gen(function* closed() {
      const { close, storage } = yield* openStore(layer);
      yield* close;
      const failures = yield* Effect.all(
        [
          Effect.flip(storage.addAgentJoinRequest(request, created)),
          Effect.flip(storage.findAgentJoinRequest("WDJB-MJHT", before)),
          Effect.flip(storage.approveAgentJoinRequest("WDJB-MJHT", approval, before)),
          Effect.flip(storage.collectAgentJoinRequest({ now: before, requestHash, sessionHash })),
          Effect.flip(storage.listPendingAgentJoinRequests(before)),
          Effect.flip(storage.denyAgentJoinRequest("WDJB-MJHT", before)),
        ],
        { concurrency: 1 },
      );

      expect(failures).toMatchObject(Array.from({ length: FAILING_CALLS }, () => ({ _tag: "StorageUnavailable" })));
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent join request's session URL goes to the agent session token it issues",
  ({ layer }) =>
    Effect.gen(function* collectsSessionUrl() {
      const { storage } = yield* openStore(layer);
      const sessionUrl = "https://claude.ai/code/session_1";
      yield* withAgent(storage);
      yield* storage.addAgentJoinRequest({ ...request, sessionUrl }, created);
      yield* storage.approveAgentJoinRequest("WDJB-MJHT", approval, before);
      const collected = yield* storage.collectAgentJoinRequest({ now: before, requestHash, sessionHash });
      const listed = yield* storage.findLiveAgentSession({ identity: agent.name, now: before });

      expect(collected).toMatchObject({ sessionUrl, status: "collected" });
      expect(listed).toMatchObject({ value: { host: "build-box", sessionUrl } });
    }),
);

function deniedOnce(storage: Store): Effect.Effect<readonly string[], StorageUnavailable> {
  return Effect.gen(function* addThenDenyTwice() {
    yield* withAgent(storage);
    yield* storage.addAgentJoinRequest(request, created);
    const denied = yield* storage.denyAgentJoinRequest("WDJB-MJHT", before);
    const deniedAgain = yield* storage.denyAgentJoinRequest("WDJB-MJHT", before);
    const unknown = yield* storage.denyAgentJoinRequest("NONE-SUCH", before);
    return [denied, deniedAgain, unknown];
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): a denied agent join request leaves the pending list and can't be approved",
  ({ layer }) =>
    Effect.gen(function* deniedLeaves() {
      const { storage } = yield* openStore(layer);
      const denials = yield* deniedOnce(storage);
      const listed = yield* storage.listPendingAgentJoinRequests(before);
      const found = yield* storage.findAgentJoinRequest("WDJB-MJHT", before);
      const approved = yield* storage.approveAgentJoinRequest("WDJB-MJHT", approval, before);

      expect(denials).toStrictEqual(["denied", "not_found", "not_found"]);
      expect([listed, approved]).toStrictEqual([[], "not_found"]);
      expect(found).toBeUndefined();
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a denied agent join request collects as denied until it expires",
  ({ layer }) =>
    Effect.gen(function* deniedCollects() {
      const { storage } = yield* openStore(layer);
      yield* deniedOnce(storage);
      const collected = yield* storage.collectAgentJoinRequest({ now: before, requestHash, sessionHash });
      const expired = yield* storage.collectAgentJoinRequest({ now: after, requestHash, sessionHash });

      expect([collected, expired]).toStrictEqual([{ status: "denied" }, { status: "gone" }]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an approved agent join request can't be denied",
  ({ layer }) =>
    Effect.gen(function* approvedStays() {
      const { storage } = yield* openStore(layer);
      yield* withAgent(storage);
      yield* storage.addAgentJoinRequest(request, created);
      yield* storage.approveAgentJoinRequest("WDJB-MJHT", approval, before);
      const denied = yield* storage.denyAgentJoinRequest("WDJB-MJHT", before);
      const collected = yield* storage.collectAgentJoinRequest({ now: before, requestHash, sessionHash });

      expect(denied).toBe("not_found");
      expect(collected).toMatchObject({ status: "collected" });
    }),
);
