import { Effect, String as Str } from "effect";
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
import { tokenHash } from "../../../identities/index.ts";

interface AdasSchedule {
  readonly storage: Storage["Service"];
  readonly schedule: StoredScheduledMessage;
}

const HASH_LENGTH = 64;
const CREATED = isoTime("2026-01-05T08:00:00.000Z");
const NINE = isoTime("2026-01-05T09:00:00.000Z");
const ADA = identityName("ada");
const GRILL = channelName("grill");
const PAGE = { limit: 10 } as const;

function hashOf(letter: string): ReturnType<typeof tokenHash> {
  return tokenHash(Str.repeat(HASH_LENGTH)(letter));
}

function adasSchedule<Failure, Needs>(
  layer: Layer.Layer<Storage, Failure, Needs>,
): Effect.Effect<AdasSchedule, never, Needs> {
  return Effect.gen(function* openGrill() {
    const { storage } = yield* openStore(layer);
    yield* storage.createChannel(channel("grill"));
    yield* storage.createIdentity(identityFixture("ada", { kind: "human" }), hashOf("a"));
    const schedule = yield* Effect.flatMap(
      storage.createScheduledMessage({
        at: null,
        channel: GRILL,
        createdAt: CREATED,
        creator: ADA,
        cron: "0 9 * * *",
        text: "standup",
        timeZone: "UTC",
      }),
      Effect.fromNullishOr,
    );
    return { schedule, storage };
  }).pipe(Effect.orDie);
}

const post = newMessageFixture("grill", "standup", { author: { name: "ada" } });

it.effect.each(storageLayers)(
  "storage contract ($adapter): a run read before its creator's deactivation is refused, and reactivation leaves it paused",
  ({ layer }) =>
    Effect.gen(function* deactivatedRun() {
      const { schedule, storage } = yield* adasSchedule(layer);
      yield* storage.deactivateIdentity(ADA);
      const result = yield* storage.runScheduledMessage({
        due: NINE,
        finished: false,
        id: schedule.id,
        message: post,
        runsFrom: CREATED,
      });
      yield* storage.reactivateIdentity(ADA, hashOf("r"));
      const after = yield* storage.findScheduledMessage(schedule.id);
      const page = yield* Effect.flatMap(storage.listChannelMessages(GRILL, PAGE), Effect.fromNullishOr);

      expect(result).toStrictEqual({ status: "run_moved" });
      expect(after).toMatchObject({ lastRun: null, pausedBecause: "creator_deactivated", status: "paused" });
      expect(page.messages).toStrictEqual([]);
    }),
);
