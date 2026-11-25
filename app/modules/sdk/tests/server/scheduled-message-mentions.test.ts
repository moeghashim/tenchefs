import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { CookoutEvent } from "../../index.ts";
import { Effect } from "effect";
import { TestClock } from "effect/testing";

const HUMAN = { kind: "human" } as const;
const SETTLE = "30 millis";
const STANDUP = "@ada standup @bob";
const ONE_AT_A_TIME = { concurrency: 1 } as const;

const settled: Effect.Effect<void> = TestClock.withLive(Effect.sleep(SETTLE));

const board = Effect.gen(function* openBoard() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", HUMAN);
  const bob = yield* cookout.createIdentity("bob", HUMAN);
  yield* answer(() => ada.client.createChannel({ name: "grill" }));
  return { ada, bob };
});

it.effect(
  "a schedule's tag of its own creator reaches the creator's Inbox as an unread mention, a direct one doesn't",
  () =>
    Effect.gen(function* scheduledSelfTag() {
      const { ada, bob } = yield* board;
      yield* answer(() => ada.client.createMessage({ channel: "grill", text: "@ada direct" }));
      yield* answer(() =>
        ada.client.createScheduledMessage({ channel: "grill", cron: "0 9 * * *", text: STANDUP, timeZone: "UTC" }),
      );
      yield* Effect.andThen(Effect.andThen(settled, TestClock.adjust("9 hours")), settled);
      const [own, other] = yield* Effect.all(
        [answer(() => ada.client.inbox()), answer(() => bob.client.inbox())],
        ONE_AT_A_TIME,
      );

      expect(own.items).toMatchObject([{ message: { text: STANDUP }, reasons: ["mention"] }]);
      expect(other.items).toMatchObject([{ message: { text: STANDUP }, reasons: ["mention"] }]);
    }).pipe(Effect.provide(testCookout())),
);

function isLast(next: Readonly<IteratorResult<CookoutEvent>>): boolean {
  return next.done === true || next.value.type === "inbox-item";
}

function firstInboxItem(events: Readonly<AsyncIterator<CookoutEvent>>): Effect.Effect<IteratorResult<CookoutEvent>> {
  return Effect.repeat(
    Effect.promise(() => events.next()),
    { until: isLast },
  );
}

it.effect("a schedule's tag of its own creator arrives on the creator's watch as a mention", () =>
  Effect.gen(function* watchedSelfTag() {
    const { ada } = yield* board;
    const events = yield* Effect.acquireRelease(
      answer(() => ada.client.watch()),
      (stream) => answer(() => stream.close()),
    );
    yield* answer(() =>
      ada.client.createScheduledMessage({ channel: "grill", cron: "0 9 * * *", text: STANDUP, timeZone: "UTC" }),
    );
    yield* Effect.andThen(settled, TestClock.adjust("9 hours"));
    const item = yield* firstInboxItem(events[Symbol.asyncIterator]());

    expect(item).toMatchObject({
      value: { item: { message: { text: STANDUP }, reasons: ["mention"] }, type: "inbox-item" },
    });
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);
