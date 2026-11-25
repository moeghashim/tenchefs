import type { CookoutEvent, EventStream, ScheduledMessage, ScheduledMessageEvent } from "../../index.ts";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import type { TestIdentity } from "../../../testing/server.ts";

const HUMAN = { kind: "human" } as const;
const SETTLE = "30 millis";
const DAILY_NINE = { channel: "grill", cron: "0 9 * * *", text: "standup", timeZone: "UTC" } as const;

const board = Effect.gen(function* openBoard() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", HUMAN);
  const bob = yield* cookout.createIdentity("bob", HUMAN);
  yield* answer(() => ada.client.createChannel({ name: "grill" }));
  return { ada, bob, cookout };
});

function watching(who: TestIdentity): Effect.Effect<AsyncIterator<CookoutEvent>, never, Scope.Scope> {
  return Effect.map(
    Effect.acquireRelease(
      answer(() => who.client.watch()),
      (events: EventStream) => answer(() => events.close()),
    ),
    (events) => events[Symbol.asyncIterator](),
  );
}

function scheduleIn(heard: Readonly<IteratorResult<CookoutEvent>>): ScheduledMessageEvent | null {
  if (heard.done === true || heard.value.type !== "scheduled-message") {
    return null;
  }
  return heard.value;
}

function nextSchedule(events: Readonly<AsyncIterator<CookoutEvent>>): Effect.Effect<ScheduledMessageEvent | null> {
  const next = answer(() => events.next());
  return Effect.map(
    Effect.repeat(next, {
      until: (heard: Readonly<IteratorResult<CookoutEvent>>) =>
        heard.done === true || heard.value.type === "scheduled-message",
    }),
    scheduleIn,
  );
}

function made(who: TestIdentity): Effect.Effect<ScheduledMessage> {
  return Effect.map(
    answer(() => who.client.createScheduledMessage(DAILY_NINE)),
    ({ scheduledMessage }) => scheduledMessage,
  );
}

function heardAfter(
  events: AsyncIterator<CookoutEvent>,
  call: () => Promise<unknown>,
): Effect.Effect<ScheduledMessageEvent | null> {
  return Effect.andThen(
    answer(() => call()),
    nextSchedule(events),
  );
}

it.effect("creating, editing, pausing, resuming and deleting a schedule each reach another identity's stream", () =>
  Effect.gen(function* everyChange() {
    const { ada, bob } = yield* board;
    const events = yield* watching(bob);
    const schedule = yield* made(ada);
    const created = yield* nextSchedule(events);
    const heard = yield* Effect.forEach(
      [
        (): Promise<unknown> => ada.client.editScheduledMessage(schedule.id, { text: "standup, now" }),
        (): Promise<unknown> => ada.client.pauseScheduledMessage(schedule.id),
        (): Promise<unknown> => ada.client.resumeScheduledMessage(schedule.id),
        (): Promise<unknown> => ada.client.deleteScheduledMessage(schedule.id),
      ],
      (call) => heardAfter(events, call),
      { concurrency: 1 },
    );

    expect([created, ...heard]).toMatchObject([
      { deleted: false, scheduledMessage: { id: schedule.id, status: "active", text: "standup" } },
      { deleted: false, scheduledMessage: { id: schedule.id, text: "standup, now" } },
      { deleted: false, scheduledMessage: { id: schedule.id, status: "paused" } },
      { deleted: false, scheduledMessage: { id: schedule.id, status: "active" } },
      { deleted: true, scheduledMessage: { id: schedule.id } },
    ]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("each run of a schedule sends it with its latest run, and a one-off schedule's run sends it finished", () =>
  Effect.gen(function* eachRun() {
    const { ada, bob } = yield* board;
    const events = yield* watching(bob);
    const oneOff = yield* Effect.map(
      answer(() =>
        ada.client.createScheduledMessage({ at: "2026-01-01T10:00", channel: "grill", text: "lunch", timeZone: "UTC" }),
      ),
      ({ scheduledMessage }) => scheduledMessage,
    );
    yield* nextSchedule(events);
    yield* Effect.andThen(TestClock.withLive(Effect.sleep(SETTLE)), TestClock.adjust("10 hours"));
    const ran = yield* nextSchedule(events);

    expect(ran).toMatchObject({
      deleted: false,
      scheduledMessage: { id: oneOff.id, lastRun: { outcome: "posted" }, status: "finished" },
    });
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("deactivating a schedule's creator sends the schedule paused, with the reason", () =>
  Effect.gen(function* creatorDeactivated() {
    const { ada, bob, cookout } = yield* board;
    const events = yield* watching(bob);
    const schedule = yield* made(ada);
    yield* nextSchedule(events);
    yield* answer(() => cookout.client.deactivateIdentity("ada"));
    const paused = yield* nextSchedule(events);

    expect(paused).toMatchObject({
      deleted: false,
      scheduledMessage: { id: schedule.id, pausedBecause: "creator_deactivated", status: "paused" },
    });
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);
