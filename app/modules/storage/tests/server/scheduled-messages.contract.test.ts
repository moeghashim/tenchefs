import { Effect, Option, String as Str } from "effect";
import type { Storage, StorageUnavailable, StoredScheduledMessage } from "../../../storage/server.ts";
import {
  channelFixture as channel,
  channelName,
  identityFixture,
  identityName,
  isoTime,
  newMessageFixture,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Layer } from "effect";
import type { Message } from "../../../messages/index.ts";
import { isScheduledMessageId } from "../../../scheduled-messages/index.ts";
import { tokenHash } from "../../../identities/index.ts";

type NewScheduledMessage = Storage["Service"]["createScheduledMessage"] extends (schedule: infer New) => unknown
  ? New
  : never;
type ScheduledRunResult = Effect.Success<ReturnType<Storage["Service"]["runScheduledMessage"]>>;

const HASH_LENGTH = 64;
const CREATED = isoTime("2026-01-05T08:00:00.000Z");
const NINE = isoTime("2026-01-05T09:00:00.000Z");
const LATER = isoTime("2026-01-05T09:30:00.000Z");
const ADA = identityName("ada");
const MISSING_ID = 999;
const MISSING = Option.getOrThrow(Option.liftPredicate(MISSING_ID, isScheduledMessageId));

const WEEKDAYS: NewScheduledMessage = {
  at: null,
  channel: channelName("grill"),
  createdAt: CREATED,
  creator: ADA,
  cron: "0 9 * * 1-5",
  text: "standup @bob",
  timeZone: "Europe/London",
};

interface Grill {
  readonly storage: Storage["Service"];
  readonly schedule: StoredScheduledMessage;
}

function grill<Failure, Needs>(
  layer: Layer.Layer<Storage, Failure, Needs>,
): Effect.Effect<Grill, Failure | StorageUnavailable, Needs> {
  return Effect.gen(function* openGrill() {
    const { storage } = yield* openStore(layer);
    yield* storage.createChannel(channel("grill"));
    yield* storage.createChannel(channel("other"));
    yield* storage.createIdentity(identityFixture("ada", { kind: "human" }), tokenHash(Str.repeat(HASH_LENGTH)("a")));
    yield* storage.createIdentity(identityFixture("bob", { kind: "human" }), tokenHash(Str.repeat(HASH_LENGTH)("b")));
    const schedule = yield* Effect.flatMap(storage.createScheduledMessage(WEEKDAYS), Effect.fromNullishOr);
    return { schedule, storage };
  }).pipe(Effect.orDie);
}

function postedOf(result: ScheduledRunResult): Effect.Effect<Message, string> {
  if (result.status !== "appended") {
    return Effect.fail(result.status);
  }
  return Effect.succeed(result.message);
}

const post = newMessageFixture("grill", "standup @bob", { author: { name: "ada" }, mentions: ["bob"] });

it.effect.each(storageLayers)(
  "storage contract ($adapter): a scheduled message is created active from its creation and read back",
  ({ layer }) =>
    Effect.gen(function* createdBack() {
      const { schedule, storage } = yield* grill(layer);
      const other = yield* storage.createScheduledMessage({ ...WEEKDAYS, channel: channelName("other") });
      const found = yield* storage.findScheduledMessage(schedule.id);
      const inGrill = yield* storage.listScheduledMessages(channelName("grill"));
      const all = yield* storage.listScheduledMessages();
      const nowhere = yield* storage.createScheduledMessage({ ...WEEKDAYS, channel: channelName("gone") });

      expect(schedule).toStrictEqual({
        ...WEEKDAYS,
        id: schedule.id,
        lastRun: null,
        pausedBecause: null,
        runsFrom: CREATED,
        status: "active",
        updatedAt: CREATED,
      });
      expect([found, inGrill, all]).toStrictEqual([schedule, [schedule], [schedule, other]]);
      expect(nowhere).toBeUndefined();
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a run posts its message marked with the schedule and moves runsFrom to its due moment",
  ({ layer }) =>
    Effect.gen(function* runPosts() {
      const { schedule, storage } = yield* grill(layer);
      const result = yield* storage.runScheduledMessage({
        due: NINE,
        finished: false,
        id: schedule.id,
        message: post,
        runsFrom: CREATED,
      });
      const after = yield* storage.findScheduledMessage(schedule.id);
      const message = yield* postedOf(result);
      const thread = yield* Effect.flatMap(storage.getThread(message.id), Effect.fromNullishOr);

      expect(message).toMatchObject({ mentions: [identityName("bob")], scheduledMessage: { deleted: false } });
      expect(thread.parent.scheduledMessage).toStrictEqual({ deleted: false, id: schedule.id });
      expect(after).toMatchObject({
        lastRun: { due: NINE, messageId: message.id, outcome: "posted" },
        runsFrom: NINE,
        status: "active",
      });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a run is refused when runsFrom moved since it was read, or the schedule is paused",
  ({ layer }) =>
    Effect.gen(function* runMoved() {
      const { schedule, storage } = yield* grill(layer);
      const run = { due: NINE, finished: false, id: schedule.id, runsFrom: CREATED };
      const first = yield* storage.runScheduledMessage(run);
      const again = yield* storage.runScheduledMessage({ ...run, message: post });
      yield* storage.pauseScheduledMessage(schedule.id, LATER);
      const whilePaused = yield* storage.runScheduledMessage({ ...run, runsFrom: NINE });
      const page = yield* Effect.flatMap(
        storage.listChannelMessages(channelName("grill"), { limit: 10 }),
        Effect.fromNullishOr,
      );

      expect([first, again, whilePaused]).toStrictEqual([
        { status: "skipped" },
        { status: "run_moved" },
        { status: "run_moved" },
      ]);
      expect(page.messages).toStrictEqual([]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): pausing and resuming moves runsFrom to the resume, and a one-off run finishes it",
  ({ layer }) =>
    Effect.gen(function* pauseResume() {
      const { schedule, storage } = yield* grill(layer);
      const pausedOne = yield* storage.pauseScheduledMessage(schedule.id, NINE);
      const resumed = yield* storage.resumeScheduledMessage(schedule.id, LATER);
      const oneOff = yield* Effect.flatMap(
        storage.createScheduledMessage({ ...WEEKDAYS, at: NINE, cron: null }),
        Effect.fromNullishOr,
      );
      yield* storage.runScheduledMessage({ due: NINE, finished: true, id: oneOff.id, runsFrom: CREATED });
      const finished = yield* storage.findScheduledMessage(oneOff.id);
      const pausedAgain = yield* storage.pauseScheduledMessage(oneOff.id, LATER);

      expect([pausedOne, resumed]).toMatchObject([
        { pausedBecause: null, status: "paused", updatedAt: NINE },
        { runsFrom: LATER, status: "active", updatedAt: LATER },
      ]);
      expect(finished).toMatchObject({
        lastRun: { due: NINE, messageId: null, outcome: "skipped" },
        status: "finished",
      });
      expect(pausedAgain).toStrictEqual(finished);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a deleted schedule leaves every list and its posts read deleted",
  ({ layer }) =>
    Effect.gen(function* softDelete() {
      const { schedule, storage } = yield* grill(layer);
      const result = yield* storage.runScheduledMessage({
        due: NINE,
        finished: false,
        id: schedule.id,
        message: post,
        runsFrom: CREATED,
      });
      const deleted = yield* storage.deleteScheduledMessage(schedule.id, LATER);
      const found = yield* storage.findScheduledMessage(schedule.id);
      const listed = yield* storage.listScheduledMessages();
      const again = yield* storage.deleteScheduledMessage(schedule.id, LATER);
      const page = yield* Effect.flatMap(
        storage.listChannelMessages(channelName("grill"), { limit: 10 }),
        Effect.fromNullishOr,
      );

      expect(result.status).toBe("appended");
      expect([deleted, listed, found ?? null, again ?? null]).toMatchObject([{ id: schedule.id }, [], null, null]);
      expect(page.messages).toMatchObject([{ scheduledMessage: { deleted: true, id: schedule.id } }]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): deactivating the creator pauses its active schedules, and deleting a channel deletes its own",
  ({ layer }) =>
    Effect.gen(function* lifecycle() {
      const { schedule, storage } = yield* grill(layer);
      const other = yield* storage.createScheduledMessage({ ...WEEKDAYS, channel: channelName("other") });
      yield* storage.deactivateIdentity(ADA);
      const paused = yield* storage.findScheduledMessage(schedule.id);
      yield* storage.deleteChannel(channelName("other"));
      const listed = yield* storage.listScheduledMessages();

      expect(other).toBeDefined();
      expect(paused).toMatchObject({ pausedBecause: "creator_deactivated", status: "paused" });
      expect(listed).toMatchObject([{ id: schedule.id }]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): changing a missing or already-changed schedule changes nothing",
  ({ layer }) =>
    Effect.gen(function* unchanged() {
      const { schedule, storage } = yield* grill(layer);
      const resumedActive = yield* storage.resumeScheduledMessage(schedule.id, LATER);
      const paused = yield* storage.pauseScheduledMessage(schedule.id, NINE);
      const bobs = yield* storage.createScheduledMessage({ ...WEEKDAYS, creator: identityName("bob") });
      yield* storage.deactivateIdentity(ADA);
      const afterDeactivation = yield* storage.listScheduledMessages();
      const [pausedMissing, resumedMissing] = yield* Effect.all(
        [storage.pauseScheduledMessage(MISSING, LATER), storage.resumeScheduledMessage(MISSING, LATER)],
        { concurrency: 1 },
      );

      expect(resumedActive).toStrictEqual(schedule);
      expect(afterDeactivation).toStrictEqual([paused, bobs]);
      expect([pausedMissing ?? null, resumedMissing ?? null]).toStrictEqual([null, null]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a run whose message can't be appended leaves the schedule as it was",
  ({ layer }) =>
    Effect.gen(function* notAppended() {
      const { schedule, storage } = yield* grill(layer);
      const result = yield* storage.runScheduledMessage({
        due: NINE,
        finished: false,
        id: schedule.id,
        message: newMessageFixture("gone", "standup", { author: { name: "ada" } }),
        runsFrom: CREATED,
      });
      const after = yield* storage.findScheduledMessage(schedule.id);

      expect(result).toStrictEqual({ status: "channel_not_found" });
      expect(after).toStrictEqual(schedule);
    }),
);

function creatorDeleted(storage: Storage["Service"]): Effect.Effect<void, StorageUnavailable> {
  return Effect.gen(function* deleteCy() {
    yield* storage.createIdentity(identityFixture("cy", { kind: "human" }), tokenHash(Str.repeat(HASH_LENGTH)("c")));
    yield* storage.createScheduledMessage({ ...WEEKDAYS, creator: identityName("cy") });
    yield* storage.deleteIdentity(identityName("cy"));
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): deleting one schedule marks only its own posts, and deleting a creator drops theirs",
  ({ layer }) =>
    Effect.gen(function* ownPosts() {
      const { schedule, storage } = yield* grill(layer);
      const other = yield* Effect.flatMap(
        storage.createScheduledMessage({ ...WEEKDAYS, channel: channelName("other") }),
        Effect.fromNullishOr,
      );
      const otherPost = newMessageFixture("other", "standup", { author: { name: "ada" } });
      yield* storage.runScheduledMessage({
        due: NINE,
        finished: false,
        id: other.id,
        message: otherPost,
        runsFrom: CREATED,
      });
      yield* storage.deleteScheduledMessage(schedule.id, LATER);
      yield* creatorDeleted(storage);
      const listed = yield* storage.listScheduledMessages();
      const page = yield* Effect.flatMap(
        storage.listChannelMessages(channelName("other"), { limit: 10 }),
        Effect.fromNullishOr,
      );

      expect(listed).toMatchObject([{ id: other.id }]);
      expect(page.messages).toMatchObject([{ scheduledMessage: { deleted: false, id: other.id } }]);
    }),
);
