import type {
  CookoutClient,
  CookoutEvent,
  CreateScheduledMessageRequest,
  EventStream,
  Message,
  ScheduledMessage,
} from "../../index.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import type { TestIdentity } from "../../../testing/server.ts";
import { createCookoutClient } from "../../index.ts";

type Wait = `${number} hours` | `${number} minutes` | `${number} days`;

const HUMAN = { kind: "human" } as const;
const SETTLE = "30 millis";
const UTC = "UTC";
const ONE = 1;
const TWO = 2;
const CONFLICT = 409;
const DAILY_NINE = { channel: "grill", cron: "0 9 * * *", text: "standup @bob", timeZone: UTC } as const;

const board = Effect.gen(function* openBoard() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", HUMAN);
  const bob = yield* cookout.createIdentity("bob", HUMAN);
  yield* answer(() => ada.client.createChannel({ name: "grill" }));
  return { ada, bob, cookout };
});

const settled: Effect.Effect<void> = TestClock.withLive(Effect.sleep(SETTLE));

function quietFor(wait: Wait): Effect.Effect<void> {
  return Effect.andThen(Effect.andThen(settled, TestClock.adjust(wait)), settled);
}

function schedule(who: TestIdentity, request: CreateScheduledMessageRequest): Effect.Effect<ScheduledMessage> {
  return Effect.map(
    answer(() => who.client.createScheduledMessage(request)),
    ({ scheduledMessage }) => scheduledMessage,
  );
}

function grillTexts(client: CookoutClient): Effect.Effect<readonly Message[]> {
  return Effect.map(
    answer(() => client.listMessages("grill")),
    ({ messages }) => messages,
  );
}

function shown(client: CookoutClient, made: ScheduledMessage): Effect.Effect<ScheduledMessage> {
  return Effect.map(
    answer(() => client.getScheduledMessage(made.id)),
    ({ scheduledMessage }) => scheduledMessage,
  );
}

it.effect("a recurring schedule posts as its creator at each run, marked, and its mention reaches the Inbox", () =>
  Effect.gen(function* recurring() {
    const { ada, bob } = yield* board;
    const made = yield* schedule(ada, DAILY_NINE);
    const first = yield* Effect.andThen(quietFor("9 hours"), grillTexts(ada.client));
    const second = yield* Effect.andThen(quietFor("1 days"), grillTexts(ada.client));
    const inbox = yield* answer(() => bob.client.inbox());

    expect(made).toMatchObject({
      creator: { name: "ada" },
      nextRuns: ["2026-01-01T09:00:00.000Z", "2026-01-02T09:00:00.000Z", "2026-01-03T09:00:00.000Z"],
      status: "active",
    });
    expect(first).toMatchObject([
      { author: { name: "ada" }, mentions: ["bob"], scheduledMessage: { deleted: false, id: made.id } },
    ]);
    expect([second.length, inbox.items.length]).toStrictEqual([TWO, TWO]);
  }).pipe(Effect.provide(testCookout())),
);

function watching(who: TestIdentity): Effect.Effect<AsyncIterator<CookoutEvent>, never, Scope.Scope> {
  return Effect.map(
    Effect.acquireRelease(
      answer(() => who.client.watch()),
      (events: EventStream) => answer(() => events.close()),
    ),
    (events) => events[Symbol.asyncIterator](),
  );
}

function nextInboxItem(events: AsyncIterator<CookoutEvent>): Effect.Effect<IteratorResult<CookoutEvent>> {
  return Effect.repeat(
    answer(() => events.next()),
    {
      until: (heard: Readonly<IteratorResult<CookoutEvent>>) =>
        heard.done === true || heard.value.type === "inbox-item",
    },
  );
}

it.effect("a scheduled post's mention reaches the Inbox with the mention reason and arrives on the live stream", () =>
  Effect.gen(function* scheduledMention() {
    const { ada, bob } = yield* board;
    const events = yield* watching(bob);
    yield* schedule(ada, DAILY_NINE);
    yield* quietFor("9 hours");
    const event = yield* nextInboxItem(events);
    const { items } = yield* answer(() => bob.client.inbox());

    expect(items).toMatchObject([{ message: { scheduledMessage: { deleted: false } }, reasons: ["mention"] }]);
    expect(event).toMatchObject({
      value: { item: { message: { text: "standup @bob" }, reasons: ["mention"] }, type: "inbox-item" },
    });
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("a one-off schedule posts once at its moment, read in its time zone, then is finished", () =>
  Effect.gen(function* oneOff() {
    const { ada } = yield* board;
    const made = yield* schedule(ada, {
      at: "2026-01-01T10:00",
      channel: "grill",
      text: "lunch",
      timeZone: "Europe/Paris",
    });
    yield* quietFor("10 hours");
    const after = yield* shown(ada.client, made);
    const posted = yield* grillTexts(ada.client);

    expect(made).toMatchObject({ at: "2026-01-01T09:00:00.000Z", nextRuns: ["2026-01-01T09:00:00.000Z"] });
    expect(after).toMatchObject({ lastRun: { outcome: "posted" }, nextRuns: [], status: "finished" });
    expect(posted).toMatchObject([{ text: "lunch" }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a schedule paused while its run is posting doesn't post", () =>
  Effect.gen(function* pausedMidRun() {
    const { ada } = yield* board;
    const made = yield* schedule(ada, DAILY_NINE);
    yield* quietFor("9 hours");
    const after = yield* shown(ada.client, made);
    const posted = yield* grillTexts(ada.client);

    expect(after.status).toBe("paused");
    expect(after).not.toHaveProperty("lastRun");
    expect(posted).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout({ storage: "paused-mid-run" }))),
);

it.effect("only the creator, an agent creator's owner or an admin can pause, resume or delete a schedule", () =>
  Effect.gen(function* permissions() {
    const { ada, bob, cookout } = yield* board;
    const bot = yield* cookout.createIdentity("ada-bot", { owner: "ada" });
    const made = yield* schedule(bot, DAILY_NINE);
    const refused = yield* refusal(() => bob.client.pauseScheduledMessage(made.id));
    const byOwner = yield* answer(() => ada.client.pauseScheduledMessage(made.id));
    const byAdmin = yield* answer(() => cookout.client.resumeScheduledMessage(made.id));
    const byCreator = yield* answer(() => bot.client.deleteScheduledMessage(made.id));
    const gone = yield* refusal(() => bob.client.getScheduledMessage(made.id));

    expect([refused.code, gone.code]).toStrictEqual(["not_owner", "scheduled_message_not_found"]);
    expect([byOwner, byAdmin, byCreator]).toMatchObject([
      { scheduledMessage: { status: "paused" } },
      { scheduledMessage: { status: "active" } },
      { scheduledMessage: { id: made.id } },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "deactivating the creator pauses its schedules, nothing posts when they fall due, and resuming is refused",
  () =>
    Effect.gen(function* deactivation() {
      const { ada, cookout } = yield* board;
      const made = yield* schedule(ada, DAILY_NINE);
      yield* answer(() => cookout.client.deactivateIdentity("ada"));
      const paused = yield* shown(cookout.client, made);
      const refused = yield* refusal(() => cookout.client.resumeScheduledMessage(made.id));
      const posted = yield* Effect.andThen(quietFor("10 hours"), grillTexts(cookout.client));

      expect(paused).toMatchObject({ nextRuns: [], pausedBecause: "creator_deactivated", status: "paused" });
      expect([refused.status, refused.code]).toStrictEqual([CONFLICT, "creator_deactivated"]);
      expect(posted).toStrictEqual([]);
    }).pipe(Effect.provide(testCookout())),
);

it.effect("reactivating the creator leaves its schedules paused, and a manager can resume them then", () =>
  Effect.gen(function* reactivation() {
    const { ada, cookout } = yield* board;
    const made = yield* schedule(ada, DAILY_NINE);
    yield* answer(() => cookout.client.deactivateIdentity("ada"));
    yield* answer(() => cookout.client.reactivateIdentity("ada"));
    const stillPaused = yield* shown(cookout.client, made);
    const { scheduledMessage: resumed } = yield* answer(() => cookout.client.resumeScheduledMessage(made.id));
    const posted = yield* Effect.andThen(quietFor("9 hours"), grillTexts(cookout.client));

    expect([stillPaused, resumed]).toMatchObject([
      { pausedBecause: "creator_deactivated", status: "paused" },
      { status: "active" },
    ]);
    expect(resumed).not.toHaveProperty("pausedBecause");
    expect(posted).toMatchObject([{ author: { name: "ada" }, scheduledMessage: { id: made.id } }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent's schedules keep posting when its owner is Deactivated", () =>
  Effect.gen(function* agentKeepsRunning() {
    const { cookout } = yield* board;
    const bot = yield* cookout.createIdentity("ada-bot", { owner: "ada" });
    const made = yield* schedule(bot, DAILY_NINE);
    yield* answer(() => cookout.client.deactivateIdentity("ada"));
    const after = yield* shown(cookout.client, made);
    const posted = yield* Effect.andThen(quietFor("9 hours"), grillTexts(cookout.client));

    expect(after).toMatchObject({ status: "active" });
    expect(posted).toMatchObject([{ author: { name: "ada-bot" }, scheduledMessage: { id: made.id } }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a run due as its creator is Deactivated doesn't post as the Deactivated identity", () =>
  Effect.gen(function* deactivatedMidRun() {
    const { ada, cookout } = yield* board;
    const made = yield* schedule(ada, DAILY_NINE);
    yield* quietFor("9 hours");
    const after = yield* shown(cookout.client, made);
    const posted = yield* grillTexts(cookout.client);

    expect(after).toMatchObject({ pausedBecause: "creator_deactivated", status: "paused" });
    expect(after).not.toHaveProperty("lastRun");
    expect(posted).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout({ storage: "deactivated-mid-run" }))),
);

it.effect("a paused schedule doesn't catch up its missed runs, and deleting one marks what it posted", () =>
  Effect.gen(function* pausedThenDeleted() {
    const { ada } = yield* board;
    const made = yield* schedule(ada, DAILY_NINE);
    yield* quietFor("9 hours");
    yield* answer(() => ada.client.pauseScheduledMessage(made.id));
    yield* quietFor("2 days");
    yield* answer(() => ada.client.resumeScheduledMessage(made.id));
    yield* Effect.andThen(
      quietFor("1 hours"),
      answer(() => ada.client.deleteScheduledMessage(made.id)),
    );
    const posted = yield* Effect.andThen(quietFor("1 days"), grillTexts(ada.client));

    expect(posted).toMatchObject([{ scheduledMessage: { deleted: true, id: made.id } }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("deleting a channel deletes its schedules", () =>
  Effect.gen(function* channelDeleted() {
    const { ada, cookout } = yield* board;
    yield* schedule(ada, DAILY_NINE);
    yield* answer(() => cookout.client.deleteChannel("grill"));
    const { scheduledMessages } = yield* answer(() => ada.client.listScheduledMessages());

    expect(scheduledMessages).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

function clientAt(url: string, who: TestIdentity): CookoutClient {
  return createCookoutClient({ env: {}, token: who.token, url });
}

it.effect("a run missed while the server was down posts at boot when under 10 minutes late, and is skipped after", () =>
  Effect.gen(function* restarts() {
    const { ada, cookout } = yield* board;
    const made = yield* schedule(ada, DAILY_NINE);
    const { url } = yield* cookout.restartServerAfter(TestClock.adjust("549 minutes"));
    const onTime = yield* Effect.andThen(settled, grillTexts(clientAt(url, ada)));
    const again = yield* cookout.restartServerAfter(TestClock.adjust("1450 minutes"));
    const late = yield* Effect.andThen(settled, shown(clientAt(again.url, ada), made));
    const posted = yield* grillTexts(clientAt(again.url, ada));

    expect(onTime).toHaveLength(ONE);
    expect(late.lastRun).toMatchObject({ due: "2026-01-02T09:00:00.000Z", outcome: "skipped" });
    expect(posted).toHaveLength(ONE);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a day-long outage posts a missed run at most once", () =>
  Effect.gen(function* outage() {
    const { ada, cookout } = yield* board;
    yield* schedule(ada, { ...DAILY_NINE, cron: "0,30 * * * *" });
    const { url } = yield* cookout.restartServerAfter(TestClock.adjust("1445 minutes"));
    const posted = yield* Effect.andThen(settled, grillTexts(clientAt(url, ada)));

    expect(posted).toHaveLength(ONE);
  }).pipe(Effect.provide(testCookout())),
);
