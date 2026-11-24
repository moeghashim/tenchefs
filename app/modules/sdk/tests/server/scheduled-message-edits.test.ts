import { Array as Arr, Effect } from "effect";
import type {
  CookoutClient,
  CookoutError,
  CreateScheduledMessageRequest,
  EditScheduledMessageRequest,
  Message,
  PreviewScheduledMessageQuery,
  ScheduledMessage,
} from "../../index.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { TestClock } from "effect/testing";
import type { TestIdentity } from "../../../testing/server.ts";

type Wait = `${number} hours` | `${number} days`;

const HUMAN = { kind: "human" } as const;
const SETTLE = "30 millis";
const UTC = "UTC";
const FORBIDDEN = 403;
const SEQUENTIAL = { concurrency: 1 } as const;
const FIRST = 0;
const NONE = 0;
const ONE = 1;
const LUNCH = { at: "2026-01-01T09:00:00Z", channel: "grill", text: "lunch", timeZone: UTC } as const;
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

function edit(
  client: CookoutClient,
  made: ScheduledMessage,
  request: EditScheduledMessageRequest,
): Effect.Effect<ScheduledMessage> {
  return Effect.map(
    answer(() => client.editScheduledMessage(made.id, request)),
    ({ scheduledMessage }) => scheduledMessage,
  );
}

function codeOf(refused: Readonly<Pick<CookoutError, "code">>): string {
  return refused.code;
}

function editRefusal(client: CookoutClient, made: ScheduledMessage) {
  return (fields: EditScheduledMessageRequest): Effect.Effect<string> =>
    Effect.map(
      refusal(() => client.editScheduledMessage(made.id, fields)),
      codeOf,
    );
}

function previewRefusal(client: CookoutClient) {
  return (query: PreviewScheduledMessageQuery): Effect.Effect<string> =>
    Effect.map(
      refusal(() => client.previewScheduledMessage(query)),
      codeOf,
    );
}

function grillPosts(client: CookoutClient): Effect.Effect<readonly Message[]> {
  return Effect.map(
    answer(() => client.listMessages("grill")),
    ({ messages }) => messages,
  );
}

it.effect("an edit to the text posts the new text at the next run, and an earlier post keeps its old text", () =>
  Effect.gen(function* editText() {
    const { ada } = yield* board;
    const made = yield* schedule(ada, DAILY_NINE);
    yield* quietFor("10 hours");
    const edited = yield* edit(ada.client, made, { text: "retro" });
    const posts = yield* Effect.andThen(quietFor("1 days"), grillPosts(ada.client));

    expect(edited).toMatchObject({ cron: "0 9 * * *", text: "retro" });
    expect(edited.nextRuns[FIRST]).toBe("2026-01-02T09:00:00.000Z");
    expect(posts).toMatchObject([
      { scheduledMessage: { deleted: false, id: made.id }, text: "standup @bob" },
      { scheduledMessage: { deleted: false, id: made.id }, text: "retro" },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an edit to the cron moves the next runs, and a run due under the old cron doesn't post", () =>
  Effect.gen(function* editCron() {
    const { ada } = yield* board;
    const made = yield* schedule(ada, DAILY_NINE);
    const edited = yield* edit(ada.client, made, { cron: "0 12 * * *" });
    const atNine = yield* Effect.andThen(quietFor("10 hours"), grillPosts(ada.client));
    const atNoon = yield* Effect.andThen(quietFor("3 hours"), grillPosts(ada.client));

    expect(edited.nextRuns).toStrictEqual([
      "2026-01-01T12:00:00.000Z",
      "2026-01-02T12:00:00.000Z",
      "2026-01-03T12:00:00.000Z",
    ]);
    expect([atNine.length, atNoon.length]).toStrictEqual([NONE, ONE]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("editing a finished one-off schedule to a future at, or to a cron, makes it active again", () =>
  Effect.gen(function* reopen() {
    const { ada } = yield* board;
    const [first, second] = yield* Effect.all([schedule(ada, LUNCH), schedule(ada, LUNCH)], SEQUENTIAL);
    yield* quietFor("10 hours");
    const textOnly = yield* edit(ada.client, first, { text: "late lunch" });
    const atAgain = yield* edit(ada.client, first, { at: "2026-01-02T09:00:00Z" });
    const toCron = yield* edit(ada.client, second, { cron: "0 9 * * *" });
    const posts = yield* Effect.andThen(quietFor("1 days"), grillPosts(ada.client));

    expect([textOnly.status, atAgain.status, toCron.status]).toStrictEqual(["finished", "active", "active"]);
    expect(toCron).not.toHaveProperty("at");
    expect(Arr.map(posts, ({ text }) => text)).toStrictEqual(["lunch", "lunch", "late lunch", "lunch"]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an edit is refused for the same codes as create", () =>
  Effect.gen(function* refusals() {
    const { ada } = yield* board;
    const made = yield* schedule(ada, DAILY_NINE);
    const asked: readonly EditScheduledMessageRequest[] = [
      { cron: "0 0 9 * * *" },
      { cron: "*/5 * * * *" },
      { cron: "0 9 31 2 *" },
      { timeZone: "Mars/Olympus" },
      { at: "2025-12-31T09:00:00Z" },
      { at: "2026-02-01T09:00:00Z", cron: "0 9 * * *" },
      { at: "soon" },
    ];
    const codes = yield* Effect.forEach(asked, editRefusal(ada.client, made), SEQUENTIAL);
    const gone = yield* schedule(ada, DAILY_NINE);
    yield* answer(() => ada.client.deleteScheduledMessage(gone.id));
    const missing = yield* refusal(() => ada.client.editScheduledMessage(gone.id, { text: "hi" }));

    expect([...codes, missing.code]).toStrictEqual([
      "cron_invalid",
      "cron_too_frequent",
      "cron_never_runs",
      "time_zone_invalid",
      "at_in_past",
      "cron_or_at",
      "invalid_request",
      "scheduled_message_not_found",
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("only the creator, an agent creator's owner or an admin can edit a schedule", () =>
  Effect.gen(function* permissions() {
    const { ada, bob, cookout } = yield* board;
    const bot = yield* cookout.createIdentity("ada-bot", { owner: "ada" });
    const made = yield* schedule(bot, DAILY_NINE);
    const refused = yield* refusal(() => bob.client.editScheduledMessage(made.id, { text: "mine now" }));
    const byCreator = yield* edit(bot.client, made, { text: "by the bot" });
    const byOwner = yield* edit(ada.client, made, { text: "by ada" });
    const byAdmin = yield* edit(cookout.client, made, { timeZone: "Europe/London" });

    expect([refused.status, refused.code]).toStrictEqual([FORBIDDEN, "not_owner"]);
    expect([byCreator.text, byOwner.text, byAdmin.timeZone]).toStrictEqual(["by the bot", "by ada", "Europe/London"]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a run that falls due as the schedule is edited never posts the old text", () =>
  Effect.gen(function* editedMidRun() {
    const { ada } = yield* board;
    yield* schedule(ada, DAILY_NINE);
    const atNine = yield* Effect.andThen(quietFor("10 hours"), grillPosts(ada.client));
    const nextDay = yield* Effect.andThen(quietFor("1 days"), grillPosts(ada.client));

    expect(atNine).toStrictEqual([]);
    expect(nextDay).toMatchObject([{ text: "edited mid-run" }]);
  }).pipe(Effect.provide(testCookout({ storage: "edited-mid-run" }))),
);

it.effect("the preview answers the next 3 runs of a cron across a DST change, or of an at", () =>
  Effect.gen(function* preview() {
    const { ada } = yield* board;
    yield* TestClock.adjust("86 days");
    const london = yield* answer(() =>
      ada.client.previewScheduledMessage({ cron: "0 9 * * *", timeZone: "Europe/London" }),
    );
    const once = yield* answer(() =>
      ada.client.previewScheduledMessage({ at: "2026-04-01T09:00", timeZone: "Europe/London" }),
    );

    expect(london.nextRuns).toStrictEqual([
      "2026-03-28T09:00:00.000Z",
      "2026-03-29T08:00:00.000Z",
      "2026-03-30T08:00:00.000Z",
    ]);
    expect(once.nextRuns).toStrictEqual(["2026-04-01T08:00:00.000Z"]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the preview refuses with the codes create would", () =>
  Effect.gen(function* previewRefusals() {
    const { ada } = yield* board;
    const asked: readonly PreviewScheduledMessageQuery[] = [
      { cron: "0 0 9 * * *", timeZone: UTC },
      { cron: "*/5 * * * *", timeZone: UTC },
      { cron: "0 9 31 2 *", timeZone: UTC },
      { cron: "0 9 * * *", timeZone: "+01:00" },
      { at: "2025-12-31T09:00:00Z", timeZone: UTC },
      { at: "2026-02-01T09:00:00Z", cron: "0 9 * * *", timeZone: UTC },
      { timeZone: UTC },
      { at: "soon", timeZone: UTC },
    ];
    const codes = yield* Effect.forEach(asked, previewRefusal(ada.client), SEQUENTIAL);

    expect(codes).toStrictEqual([
      "cron_invalid",
      "cron_too_frequent",
      "cron_never_runs",
      "time_zone_invalid",
      "at_in_past",
      "cron_or_at",
      "cron_or_at",
      "invalid_request",
    ]);
  }).pipe(Effect.provide(testCookout())),
);
