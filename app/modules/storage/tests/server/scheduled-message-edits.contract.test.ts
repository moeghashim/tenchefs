import { Effect, Option, Predicate, String as Str } from "effect";
import type { Storage, StoredScheduledMessage } from "../../../storage/server.ts";
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
import { isScheduledMessageId } from "../../../scheduled-messages/index.ts";
import { tokenHash } from "../../../identities/index.ts";

interface AdasSchedule {
  readonly storage: Storage["Service"];
  readonly schedule: StoredScheduledMessage;
}

const HASH_LENGTH = 64;
const CREATED = isoTime("2026-01-05T08:00:00.000Z");
const NINE = isoTime("2026-01-05T09:00:00.000Z");
const LATER = isoTime("2026-01-05T09:30:00.000Z");
const MISSING_ID = 999;
const MISSING = Option.getOrThrow(Option.liftPredicate(MISSING_ID, isScheduledMessageId));
const DAILY = {
  at: null,
  channel: channelName("grill"),
  createdAt: CREATED,
  creator: identityName("ada"),
  cron: "0 9 * * *",
  text: "standup",
  timeZone: "UTC",
} as const;
const post = newMessageFixture("grill", "standup", { author: { name: "ada" } });

function adasSchedule<Failure, Needs>(
  layer: Layer.Layer<Storage, Failure, Needs>,
): Effect.Effect<AdasSchedule, never, Needs> {
  return Effect.gen(function* openGrill() {
    const { storage } = yield* openStore(layer);
    yield* storage.createChannel(channel("grill"));
    yield* storage.createIdentity(identityFixture("ada", { kind: "human" }), tokenHash(Str.repeat(HASH_LENGTH)("a")));
    const schedule = yield* Effect.flatMap(storage.createScheduledMessage(DAILY), Effect.fromNullishOr);
    return { schedule, storage };
  }).pipe(Effect.orDie);
}

function statusOf(schedule: StoredScheduledMessage | undefined): string {
  if (Predicate.isUndefined(schedule)) {
    return "missing";
  }
  return schedule.status;
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): an edit sets the text and timing and moves runsFrom, so a run read before it is refused",
  ({ layer }) =>
    Effect.gen(function* edited() {
      const { schedule, storage } = yield* adasSchedule(layer);
      const edit = { at: null, cron: "0 12 * * *", text: "retro", timeZone: "Europe/London" };
      const changed = yield* storage.editScheduledMessage(schedule.id, edit, NINE);
      const result = yield* storage.runScheduledMessage({
        due: NINE,
        finished: false,
        id: schedule.id,
        message: post,
        runsFrom: CREATED,
      });
      const found = yield* storage.findScheduledMessage(schedule.id);
      const missing = yield* storage.editScheduledMessage(MISSING, edit, NINE);

      expect(changed).toStrictEqual(found);
      expect(found).toMatchObject({ ...edit, runsFrom: NINE, status: "active", updatedAt: NINE });
      expect([result.status, statusOf(missing)]).toStrictEqual(["run_moved", "missing"]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a finished one-off schedule runs again when its timing is edited, not its text",
  ({ layer }) =>
    Effect.gen(function* reopened() {
      const { storage } = yield* adasSchedule(layer);
      const oneOff = yield* Effect.flatMap(
        storage.createScheduledMessage({ ...DAILY, at: NINE, cron: null }),
        Effect.fromNullishOr,
      );
      yield* storage.runScheduledMessage({ due: NINE, finished: true, id: oneOff.id, runsFrom: CREATED });
      const textOnly = yield* storage.editScheduledMessage(oneOff.id, { ...oneOff, text: "late" }, LATER);
      const retimed = yield* storage.editScheduledMessage(oneOff.id, { ...oneOff, at: LATER }, LATER);

      expect([statusOf(textOnly), statusOf(retimed)]).toStrictEqual(["finished", "active"]);
    }),
);
