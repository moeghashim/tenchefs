import { Array as Arr, DateTime, Effect, Option, String as Str } from "effect";
import type { Storage, StorageUnavailable, StoredDeactivatedQuietAgent } from "../../../storage/server.ts";
import {
  appendTo,
  callId,
  channelFixture as channel,
  handlerFixture,
  identityFixture,
  identityName,
  isoTime,
  newMessageFixture,
  openStore,
  storageLayers,
  webhookCommandFixture,
  webhookCommandName,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { isDeactivatedQuietAgentId, quietAgentDays } from "../../../inbox/index.ts";
import type { DeactivatedQuietAgentId } from "../../../inbox/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { Layer } from "effect";
import { TestClock } from "effect/testing";
import { tokenHash } from "../../../identities/index.ts";

const MATT = identityName("matt");
const ADA = identityName("ada");
const BEA = identityName("bea");
const SCOUT = identityName("matt/scout");
const DEPLOY = identityName("deploy");
const HASH_LENGTH = 64;
const CREATED = isoTime("2026-01-01T00:00:00.000Z");
const JAN_31 = isoTime("2026-01-31T00:00:00.000Z");
const FEB_9 = isoTime("2026-02-09T00:00:00.000Z");
const MAR_2 = isoTime("2026-03-02T00:00:00.000Z");
const MAR_31 = isoTime("2026-03-31T00:00:00.000Z");
const APR_1 = isoTime("2026-04-01T00:00:00.000Z");
const MAY_1 = isoTime("2026-05-01T00:00:00.000Z");
const MAY_10 = isoTime("2026-05-10T00:00:00.000Z");
const MAY_31 = isoTime("2026-05-31T00:00:00.000Z");
const MISSING = 99;

interface Board {
  readonly storage: Storage["Service"];
  readonly postAt: (at: IsoTime) => Effect.Effect<unknown>;
}

function hashOf(letter: string): ReturnType<typeof tokenHash> {
  return tokenHash(Str.repeat(HASH_LENGTH)(letter));
}

function peopleOnline(storage: Storage["Service"]): Effect.Effect<void, StorageUnavailable> {
  return Effect.forEach(
    [MATT, ADA, BEA],
    (name) => storage.recordPresence({ identity: name, lastSeenAt: CREATED, online: true }),
    { concurrency: 1, discard: true },
  );
}

function board<Failure, Needs>(
  layer: Layer.Layer<Storage, Failure, Needs>,
): Effect.Effect<Board, Failure | StorageUnavailable, Needs> {
  return Effect.gen(function* openBoard() {
    yield* TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe(CREATED)));
    const { storage } = yield* openStore(layer);
    yield* storage.createChannel(channel("grill"));
    yield* storage.createIdentity(identityFixture("ada", { admin: true, kind: "human" }), hashOf("a"));
    yield* storage.createIdentity(identityFixture("bea", { admin: true, kind: "human" }), hashOf("b"));
    yield* storage.createIdentity(identityFixture("matt/scout", { owner: "matt" }), hashOf("c"));
    yield* peopleOnline(storage);
    const append = appendTo(storage);
    const byScout = { author: { name: "matt/scout", owner: "matt" } } as const;
    return {
      postAt: (at) => append({ ...newMessageFixture("grill", "still here", byScout), createdAt: at }),
      storage,
    };
  });
}

function summary(entries: readonly StoredDeactivatedQuietAgent[]): readonly unknown[] {
  return Arr.map(entries, ({ deactivatedAt, identity, read, recipients }) => ({
    deactivatedAt,
    identity,
    read,
    recipients,
  }));
}

function idOf(entries: readonly StoredDeactivatedQuietAgent[]): DeactivatedQuietAgentId {
  return Option.getOrThrow(Option.map(Arr.head(entries), ({ id }) => id));
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): activity at an offer's exact time restarts the quiet period, so the next offer is 30 days",
  ({ layer }) =>
    Effect.gen(function* freshStart() {
      const { postAt, storage } = yield* board(layer);
      yield* storage.raiseDueDeactivationOffers(JAN_31, quietAgentDays);
      yield* postAt(JAN_31);
      const { raised } = yield* storage.raiseDueDeactivationOffers(MAR_2, quietAgentDays);
      const deactivatedEarly = yield* storage.deactivateQuietAgents(APR_1, quietAgentDays);
      const due = yield* storage.nextDeactivationOfferDue(quietAgentDays);

      expect(Arr.map(raised, ({ quietDays, raisedAt }) => ({ quietDays, raisedAt }))).toStrictEqual([
        { quietDays: 30, raisedAt: MAR_2 },
      ]);
      expect([deactivatedEarly, due]).toStrictEqual([[], APR_1]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent quiet for 90 days is deactivated once, its owner gets an unread entry, and its offer clears",
  ({ layer }) =>
    Effect.gen(function* deactivatedAfterNinety() {
      const { storage } = yield* board(layer);
      yield* Effect.all(
        [
          storage.raiseDueDeactivationOffers(JAN_31, quietAgentDays),
          storage.raiseDueDeactivationOffers(MAR_2, quietAgentDays),
        ],
        { concurrency: 1 },
      );
      const due = yield* storage.nextDeactivationOfferDue(quietAgentDays);
      const [early, deactivated, again] = yield* Effect.all(
        [
          storage.deactivateQuietAgents(MAR_31, quietAgentDays),
          storage.deactivateQuietAgents(APR_1, quietAgentDays),
          storage.deactivateQuietAgents(MAY_1, quietAgentDays),
        ],
        { concurrency: 1 },
      );
      const [scout, { cleared }, listed, admins, next] = yield* Effect.all(
        [
          storage.findIdentityByName(SCOUT),
          storage.raiseDueDeactivationOffers(APR_1, quietAgentDays),
          storage.listDeactivatedQuietAgents(MATT),
          storage.listDeactivatedQuietAgents(ADA),
          storage.nextDeactivationOfferDue(quietAgentDays),
        ],
        { concurrency: 1 },
      );

      expect([due, early, again, scout, next]).toMatchObject([APR_1, [], [], { deactivated: true }, null]);
      expect(summary(deactivated)).toStrictEqual([
        { deactivatedAt: APR_1, identity: SCOUT, read: false, recipients: [MATT] },
      ]);
      expect([summary(listed), admins]).toStrictEqual([summary(deactivated), []]);
      expect(Arr.map(cleared, ({ raisedAt }) => raisedAt)).toStrictEqual([MAR_2]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a person quiet for 90 days or more is never deactivated",
  ({ layer }) =>
    Effect.gen(function* peopleStay() {
      const { storage } = yield* board(layer);
      yield* storage.recordPresence({ identity: ADA, lastSeenAt: CREATED, online: false });
      yield* storage.deactivateIdentity(SCOUT);
      const deactivated = yield* storage.deactivateQuietAgents(MAY_31, quietAgentDays);
      const ada = yield* storage.findIdentityByName(ADA);

      expect(deactivated).toStrictEqual([]);
      expect(ada).not.toHaveProperty("deactivated");
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): the entry goes to every active admin when the owner is Deactivated, and is read for all",
  ({ layer }) =>
    Effect.gen(function* toAdmins() {
      const { storage } = yield* board(layer);
      yield* storage.deactivateIdentity(MATT);
      const deactivated = yield* storage.deactivateQuietAgents(APR_1, quietAgentDays);
      const notMatts = yield* storage.markDeactivatedQuietAgentRead(MATT, idOf(deactivated));
      const missing = yield* storage.markDeactivatedQuietAgentRead(
        ADA,
        Option.getOrThrow(Option.liftPredicate(MISSING, isDeactivatedQuietAgentId)),
      );
      const read = yield* storage.markDeactivatedQuietAgentRead(ADA, idOf(deactivated));
      const beas = yield* storage.listDeactivatedQuietAgents(BEA);

      expect(Arr.map(deactivated, ({ recipients }) => recipients)).toStrictEqual([[ADA, BEA]]);
      expect([notMatts, missing, read, Arr.map(beas, (entry) => entry.read)]).toMatchObject([
        null,
        null,
        { read: true },
        [true],
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): reading up to an entry reads only the unread ones up to it",
  ({ layer }) =>
    Effect.gen(function* readUpTo() {
      const { storage } = yield* board(layer);
      const deactivated = yield* storage.deactivateQuietAgents(APR_1, quietAgentDays);
      const others = yield* storage.markDeactivatedQuietAgentsReadUpTo(ADA, idOf(deactivated));
      const read = yield* storage.markDeactivatedQuietAgentsReadUpTo(MATT, idOf(deactivated));
      const again = yield* storage.markDeactivatedQuietAgentsReadUpTo(MATT, idOf(deactivated));

      expect([others, Arr.map(read, ({ id, read: isRead }) => [id, isRead]), again]).toStrictEqual([
        [],
        [[idOf(deactivated), true]],
        [],
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): reactivation is activity, and reading an agent's entries reads them once",
  ({ layer }) =>
    Effect.gen(function* reactivated() {
      const { storage } = yield* board(layer);
      yield* storage.deactivateQuietAgents(APR_1, quietAgentDays);
      yield* TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe(MAY_10)));
      yield* storage.reactivateIdentity(SCOUT, hashOf("d"));
      const last = yield* storage.lastActivityOf(SCOUT);
      const due = yield* storage.nextDeactivationOfferDue(quietAgentDays);
      const read = yield* storage.readDeactivatedQuietAgentsOf(SCOUT);
      const again = yield* storage.readDeactivatedQuietAgentsOf(SCOUT);

      expect([last, due]).toStrictEqual([MAY_10, isoTime("2026-06-09T00:00:00.000Z")]);
      expect([summary(read), again]).toStrictEqual([
        [{ deactivatedAt: APR_1, identity: SCOUT, read: true, recipients: [MATT] }],
        [],
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a call to a command is its handler's activity",
  ({ layer }) =>
    Effect.gen(function* calledHandler() {
      const { storage } = yield* board(layer);
      yield* storage.addWebhookCommand(webhookCommandFixture("deploy"), handlerFixture("deploy"));
      yield* storage.appendWebhookCommandCall({
        delivery: {
          attempts: 0,
          callId: callId("call_1"),
          command: webhookCommandName("deploy"),
          data: {},
          nextAttemptAt: FEB_9,
          outcome: "pending",
        },
        message: {
          ...newMessageFixture("grill", "/deploy", { author: { name: "ada" } }),
          createdAt: FEB_9,
        },
        token: { expiresAt: MAR_2, handler: DEPLOY, hash: hashOf("e") },
      });
      const last = yield* storage.lastActivityOf(DEPLOY);

      expect(last).toBe(FEB_9);
    }),
);
