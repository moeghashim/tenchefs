import { Array as Arr, Effect, String as Str } from "effect";
import type { Storage, StorageUnavailable, StoredScheduledMessage } from "../../../storage/server.ts";
import {
  channelFixture as channel,
  identityFixture,
  identityName,
  isoTime,
  newMessageFixture,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Layer } from "effect";
import type { MessageId } from "../../../messages/index.ts";
import { tokenHash } from "../../../identities/index.ts";

type ScheduledRunResult = Effect.Success<ReturnType<Storage["Service"]["runScheduledMessage"]>>;

interface Grill {
  readonly storage: Storage["Service"];
  readonly schedule: StoredScheduledMessage;
}

const HASH_LENGTH = 64;
const CREATED = isoTime("2026-01-05T08:00:00.000Z");
const NINE = isoTime("2026-01-05T09:00:00.000Z");
const ADA = identityName("ada");
const BOB = identityName("bob");
const PAGE = 10;
const ONE_AT_A_TIME = { concurrency: 1 } as const;

const selfTag = newMessageFixture("grill", "@ada standup @bob", { author: { name: "ada" }, mentions: ["ada", "bob"] });

function grill<Failure, Needs>(
  layer: Layer.Layer<Storage, Failure, Needs>,
): Effect.Effect<Grill, Failure | StorageUnavailable, Needs> {
  return Effect.gen(function* openGrill() {
    const { storage } = yield* openStore(layer);
    yield* storage.createChannel(channel("grill"));
    yield* storage.createIdentity(identityFixture("ada", { kind: "human" }), tokenHash(Str.repeat(HASH_LENGTH)("a")));
    yield* storage.createIdentity(identityFixture("bob", { kind: "human" }), tokenHash(Str.repeat(HASH_LENGTH)("b")));
    const schedule = yield* Effect.flatMap(
      storage.createScheduledMessage({
        at: null,
        channel: selfTag.channel,
        createdAt: CREATED,
        creator: ADA,
        cron: "0 9 * * 1-5",
        text: selfTag.text,
        timeZone: "UTC",
      }),
      Effect.fromNullishOr,
    );
    return { schedule, storage };
  }).pipe(Effect.orDie);
}

function postedId(result: ScheduledRunResult): Effect.Effect<MessageId, string> {
  if (result.status !== "appended") {
    return Effect.fail(result.status);
  }
  return Effect.succeed(result.message.id);
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): a run's tag of its own creator is an unread mention for them, a direct self-tag isn't",
  ({ layer }) =>
    Effect.gen(function* scheduledSelfTag() {
      const { schedule, storage } = yield* grill(layer);
      yield* storage.appendMessage(selfTag);
      const id = yield* Effect.flatMap(
        storage.runScheduledMessage({
          due: NINE,
          finished: false,
          id: schedule.id,
          message: selfTag,
          runsFrom: CREATED,
        }),
        postedId,
      );
      const [ada, bob, found, history] = yield* Effect.all(
        [
          storage.listInbox(ADA),
          storage.listInbox(BOB),
          storage.findInboxItem(ADA, id),
          storage.listInboxHistory(ADA, { limit: PAGE }),
        ],
        ONE_AT_A_TIME,
      );

      expect(ada).toMatchObject([{ message: { id }, reasons: ["mention"] }]);
      expect(Arr.map(bob, (item) => item.reasons)).toStrictEqual([["mention"], ["mention"]]);
      expect(found).toMatchObject({ message: { id }, reasons: ["mention"] });
      expect(history.items).toMatchObject([{ message: { id }, read: false, reasons: ["mention"] }]);
    }),
);
