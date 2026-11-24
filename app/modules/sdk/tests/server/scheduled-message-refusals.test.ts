import type { CreateScheduledMessageRequest, ScheduledMessage } from "../../index.ts";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { TestIdentity } from "../../../testing/server.ts";

const HUMAN = { kind: "human" } as const;
const UTC = "UTC";
const NOT_FOUND = 404;
const SEQUENTIAL = { concurrency: 1 } as const;
const DAILY_NINE = { channel: "grill", cron: "0 9 * * *", text: "standup @bob", timeZone: UTC } as const;

const board = Effect.gen(function* openBoard() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", HUMAN);
  yield* answer(() => ada.client.createChannel({ name: "grill" }));
  return { ada, cookout };
});

function schedule(who: TestIdentity, request: CreateScheduledMessageRequest): Effect.Effect<ScheduledMessage> {
  return Effect.map(
    answer(() => who.client.createScheduledMessage(request)),
    ({ scheduledMessage }) => scheduledMessage,
  );
}

function refusedFor(who: TestIdentity): (fields: Partial<CreateScheduledMessageRequest>) => Effect.Effect<string> {
  return (fields) =>
    Effect.gen(function* refusedCode() {
      const refused = yield* refusal(() =>
        who.client.createScheduledMessage({ channel: "grill", text: "hi", timeZone: UTC, ...fields }),
      );
      return refused.code;
    });
}

function acceptedFor(who: TestIdentity): (cron: string) => Effect.Effect<string> {
  return (cron) => Effect.map(schedule(who, { ...DAILY_NINE, cron }), ({ status }) => status);
}

it.effect("a schedule is refused for a bad, too frequent or never-running cron, a bad zone, or a past at", () =>
  Effect.gen(function* refusals() {
    const { ada } = yield* board;
    const asked = [
      { cron: "0 0 9 * * *" },
      { cron: "*/5 * * * *" },
      { cron: "0,10 9 * * *" },
      { cron: "10,50 0,23 * * *" },
      { cron: "0 9 31 2 *" },
      { cron: "0 9 * * *", timeZone: "+01:00" },
      { cron: "0 9 * * *", timeZone: "Mars/Olympus" },
      { at: "2025-12-31T09:00:00Z" },
      { at: "2026-02-01T09:00:00Z", cron: "0 9 * * *" },
      { channel: "nowhere", cron: "0 9 * * *" },
      { channel: "Not A Channel", cron: "0 9 * * *" },
      { at: "soon" },
    ];
    const codes = yield* Effect.forEach(asked, refusedFor(ada), SEQUENTIAL);
    const accepted = yield* Effect.forEach(["30 * * * *", "0,30 * * * *", "0 9 29 2 *"], acceptedFor(ada), SEQUENTIAL);

    expect(codes).toStrictEqual([
      "cron_invalid",
      "cron_too_frequent",
      "cron_too_frequent",
      "cron_too_frequent",
      "cron_never_runs",
      "time_zone_invalid",
      "time_zone_invalid",
      "at_in_past",
      "cron_or_at",
      "channel_not_found",
      "channel_not_found",
      "invalid_request",
    ]);
    expect(accepted).toStrictEqual(["active", "active", "active"]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("listing a channel's schedules lists only that channel's, and an unknown channel is refused", () =>
  Effect.gen(function* listByChannel() {
    const { ada } = yield* board;
    const made = yield* schedule(ada, DAILY_NINE);
    const { scheduledMessages } = yield* answer(() => ada.client.listScheduledMessages({ channel: "grill" }));
    const refused = yield* refusal(() => ada.client.listScheduledMessages({ channel: "nowhere" }));
    const misnamed = yield* refusal(() => ada.client.listScheduledMessages({ channel: "Not A Channel" }));

    expect(scheduledMessages).toMatchObject([{ id: made.id }]);
    expect([refused, misnamed]).toMatchObject([
      { code: "channel_not_found", status: NOT_FOUND },
      { code: "channel_not_found", status: NOT_FOUND },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("getting Scheduled message 0, which no schedule has, is 404 scheduled_message_not_found", () =>
  Effect.gen(function* getZero() {
    const { ada, cookout } = yield* board;
    const response = yield* HttpClientRequest.get(`${cookout.url}/v1/scheduled-messages/0`).pipe(
      HttpClientRequest.setHeader("authorization", `Bearer ${ada.token}`),
      HttpClient.execute,
    );
    const json = yield* response.json;

    expect([response.status, json]).toMatchObject([NOT_FOUND, { error: { code: "scheduled_message_not_found" } }]);
  }).pipe(Effect.provide([testCookout(), FetchHttpClient.layer])),
);
