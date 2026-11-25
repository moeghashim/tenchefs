import { Array as Arr, Effect } from "effect";
import type { Storage, StorageUnavailable } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import { identityFixture as identity, isoTime, openStore, storageLayers } from "../../../testing/server.ts";
import { tokenHash } from "../../../identities/index.ts";

const created = isoTime("2026-01-01T00:00:00.000Z");
const before = isoTime("2026-01-01T00:05:00.000Z");
const expiresAt = isoTime("2026-01-01T00:15:00.000Z");
const sessionExpiry = isoTime("2026-01-08T00:05:00.000Z");
const codeHash = tokenHash("hash:code");
const sessionHash = tokenHash("hash:session");
const ada = identity("ada", { kind: "human" });
const agent = identity("joining-agent", { kind: "agent", owner: ada.name });
const WEEK = 604_800;

const joinCode = { agent: agent.name, codeHash, createdAt: created, expiresAt };
const redeem = { codeHash, host: "cloud", idleSeconds: WEEK, now: before, sessionHash };

type Store = Storage["Service"];

function withCode(storage: Store): Effect.Effect<void, StorageUnavailable> {
  return Effect.gen(function* agentWithCode() {
    yield* storage.createIdentity(ada, tokenHash("hash:ada"));
    yield* storage.createIdentity(agent, tokenHash("hash:agent"));
    yield* storage.addJoinCode(joinCode);
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): a join code is redeemed once, issuing its agent's agent session token",
  ({ layer }) =>
    Effect.gen(function* redeemOnce() {
      const { storage } = yield* openStore(layer);
      yield* withCode(storage);
      const first = yield* storage.redeemJoinCode(redeem);
      const second = yield* storage.redeemJoinCode({ ...redeem, sessionHash: tokenHash("hash:other") });
      const used = yield* storage.useAgentSession({ hash: sessionHash, now: before });
      const listed = yield* storage.findLiveAgentSession({ identity: agent.name, now: before });

      expect([first, second]).toStrictEqual([
        { expiresAt: sessionExpiry, identity: agent.name, issuedAt: before, status: "redeemed" },
        { status: "gone" },
      ]);
      expect(used).toMatchObject({ identity: { name: "joining-agent" }, status: "active" });
      expect(listed).toMatchObject({ value: { host: "cloud" } });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a join code that expired, was never added, or whose agent was deleted, is gone",
  ({ layer }) =>
    Effect.gen(function* goneCodes() {
      const { storage } = yield* openStore(layer);
      yield* withCode(storage);
      const unknown = yield* storage.redeemJoinCode({ ...redeem, codeHash: tokenHash("hash:unknown") });
      const expired = yield* storage.redeemJoinCode({ ...redeem, now: expiresAt });
      yield* storage.addJoinCode({ ...joinCode, codeHash: tokenHash("hash:deleted") });
      const deleted = yield* storage.deleteIdentity(agent.name);
      const ofDeleted = yield* storage.redeemJoinCode({ ...redeem, codeHash: tokenHash("hash:deleted") });

      expect(deleted).toMatchObject({ status: "deleted" });
      expect([unknown, expired, ofDeleted]).toStrictEqual([{ status: "gone" }, { status: "gone" }, { status: "gone" }]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a join code for a deactivated agent, or one with a live session, is kept unused",
  ({ layer }) =>
    Effect.gen(function* refusedCodes() {
      const { storage } = yield* openStore(layer);
      yield* withCode(storage);
      const live = { expiresAt: sessionExpiry, hash: tokenHash("hash:live"), identity: agent.name, idleSeconds: WEEK };
      yield* storage.issueAgentSession({ force: false, session: { ...live, issuedAt: before } });
      const whileLive = yield* storage.redeemJoinCode(redeem);
      yield* storage.deactivateIdentity(agent.name);
      const deactivated = yield* storage.redeemJoinCode(redeem);
      yield* storage.reactivateIdentity(agent.name, tokenHash("hash:again"));
      const afterwards = yield* storage.redeemJoinCode(redeem);

      expect([whileLive, deactivated, afterwards]).toStrictEqual([
        { expiresAt: sessionExpiry, identity: agent.name, status: "live" },
        { identity: agent.name, status: "deactivated" },
        { expiresAt: sessionExpiry, identity: agent.name, issuedAt: before, status: "redeemed" },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a join code redeemed twice at once is redeemed once",
  ({ layer }) =>
    Effect.gen(function* redeemedOnce() {
      const { storage } = yield* openStore(layer);
      yield* withCode(storage);
      const other = tokenHash("hash:other");
      const redemptions = yield* Effect.all(
        [storage.redeemJoinCode(redeem), storage.redeemJoinCode({ ...redeem, sessionHash: other })],
        { concurrency: "unbounded" },
      );
      const uses = yield* Effect.all(
        [
          storage.useAgentSession({ hash: sessionHash, now: before }),
          storage.useAgentSession({ hash: other, now: before }),
        ],
        { concurrency: 1 },
      );

      expect(redemptions).toStrictEqual([
        { expiresAt: sessionExpiry, identity: agent.name, issuedAt: before, status: "redeemed" },
        { status: "gone" },
      ]);
      expect(Arr.map(uses, ({ status }) => status)).toStrictEqual(["active", "unknown"]);
    }),
);
