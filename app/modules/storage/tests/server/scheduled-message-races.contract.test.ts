import { Array as Arr, Effect, Order, String as Str } from "effect";
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
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const CREATED = isoTime("2026-01-05T08:00:00.000Z");
const NINE = isoTime("2026-01-05T09:00:00.000Z");
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

it.effect.each(storageLayers)(
  "storage contract ($adapter): an atomic run attempted twice at once for the same due moment posts once",
  ({ layer }) =>
    Effect.gen(function* runTwiceAtOnce() {
      const { storage } = yield* openStore(layer);
      yield* storage.createChannel(channel("grill"));
      yield* storage.createIdentity(identityFixture("ada", { kind: "human" }), tokenHash(Str.repeat(HASH_LENGTH)("a")));
      const schedule = yield* Effect.flatMap(storage.createScheduledMessage(DAILY), Effect.fromNullishOr);
      const run = { due: NINE, finished: false, id: schedule.id, message: post, runsFrom: CREATED };
      const results = yield* Effect.all([storage.runScheduledMessage(run), storage.runScheduledMessage(run)], {
        concurrency: "unbounded",
      });
      const page = yield* Effect.flatMap(
        storage.listChannelMessages(channelName("grill"), { limit: 10 }),
        Effect.fromNullishOr,
      );
      const statuses = Arr.sort(
        Arr.map(results, ({ status }) => status),
        Order.String,
      );

      expect(statuses).toStrictEqual(["appended", "run_moved"]);
      expect(Arr.map(page.messages, ({ text }) => text)).toStrictEqual(["standup"]);
    }),
);
