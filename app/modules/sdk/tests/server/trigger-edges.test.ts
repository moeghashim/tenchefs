import { AGENT, AT, TOKEN, UNREACHABLE, anyResult, board, failed } from "./trigger-board.ts";
import { Array as Arr, Effect, Option, String as Str } from "effect";
import { answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { TestClock } from "effect/testing";

const REFUSING_URL = "http://127.0.0.1:1/fire";
const OTHER_URL = "https://routines.example.com/other";
const ONCE = 1;

it.effect("a trigger URL that refuses the connection is a failed call, kept with the alert", () =>
  Effect.gen(function* refusedConnection() {
    const on = yield* board;
    yield* answer(() => on.matt.client.setTrigger(AGENT, { token: TOKEN, url: REFUSING_URL }));
    const message = yield* on.mentionSettling(failed);
    const trigger = yield* on.settled(failed);
    const { alerts } = yield* on.inbox;

    expect(trigger).toStrictEqual({
      trigger: { lastResult: { at: AT, error: UNREACHABLE, ok: false }, url: REFUSING_URL },
    });
    expect(alerts).toMatchObject([{ trigger: { error: UNREACHABLE, message } }]);
  }).pipe(Effect.provide(testCookout({ storage: "sqlite" }))),
);

it.effect("a mention in a reply calls the trigger URL too", () =>
  Effect.gen(function* replyMention() {
    const on = yield* board;
    const thread = yield* on.mention("no mention yet");
    yield* answer(() =>
      on.ada.client.createMessage({ channel: "grill", replyTo: thread, text: `@${AGENT} in the thread` }),
    );
    const calls = yield* on.cookout.triggers.waitForCalls(ONCE);

    expect(Arr.map(calls, ({ text }) => Str.includes(`/threads/${String(thread)}/`)(text))).toStrictEqual([true]);
  }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);

it.effect("a scheduled message that mentions the agent calls its trigger URL when it posts", () =>
  Effect.gen(function* scheduledMention() {
    const on = yield* board;
    yield* answer(() =>
      on.ada.client.createScheduledMessage({
        channel: "grill",
        cron: "0 9 * * *",
        text: `@${AGENT} standup`,
        timeZone: "UTC",
      }),
    );
    yield* TestClock.adjust("9 hours");
    const calls = yield* on.cookout.triggers.waitForCalls(ONCE);

    expect(Arr.map(calls, ({ text }) => Str.endsWith(`@${AGENT} standup`)(text))).toStrictEqual([true]);
  }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);

it.effect("a scheduled message that tags its own agent calls the agent's trigger URL, a direct self-tag doesn't", () =>
  Effect.gen(function* scheduledSelfTag() {
    const on = yield* board;
    yield* answer(() => on.agent.client.createMessage({ channel: "grill", text: `@${AGENT} direct` }));
    yield* answer(() =>
      on.agent.client.createScheduledMessage({
        channel: "grill",
        cron: "0 9 * * *",
        text: `@${AGENT} standup`,
        timeZone: "UTC",
      }),
    );
    yield* TestClock.adjust("9 hours");
    const calls = yield* on.cookout.triggers.waitForCalls(ONCE);

    expect(Arr.map(calls, ({ text }) => Str.endsWith(`@${AGENT} standup`)(text))).toStrictEqual([true]);
  }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);

it.effect("the result of a call to a trigger URL that was replaced meanwhile is dropped", () =>
  Effect.gen(function* replacedMidCall() {
    const on = yield* board;
    yield* on.cookout.triggers.answerNext(["no answer"]);
    yield* on.mention();
    yield* on.cookout.triggers.waitForCalls(ONCE);
    yield* answer(() => on.matt.client.setTrigger(AGENT, { token: TOKEN, url: OTHER_URL }));
    yield* TestClock.adjust("10 seconds");
    yield* TestClock.withLive(Effect.sleep("20 millis"));
    const trigger = yield* answer(() => on.matt.client.getTrigger(AGENT));

    expect(trigger).toStrictEqual({ trigger: { url: OTHER_URL } });
  }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);

it.effect("a trigger URL set on a Deactivated agent leaves it offline", () =>
  Effect.gen(function* deactivatedSet() {
    const on = yield* board;
    yield* answer(() => on.matt.client.deactivateIdentity(AGENT));
    yield* answer(() => on.matt.client.setTrigger(AGENT, { token: TOKEN, url: OTHER_URL }));
    const presence = yield* on.presence;

    expect(presence).toStrictEqual(Option.some({ identity: AGENT, online: false }));
  }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);

it.effect("a restarted server still shows an agent whose last call failed as Unreachable", () =>
  Effect.gen(function* restartedUnreachable() {
    const on = yield* board;
    yield* on.cookout.triggers.answerNext([{ error: UNREACHABLE }]);
    yield* on.mentionSettling(anyResult);
    const admin = yield* on.cookout.restart;
    const { presence } = yield* answer(() => admin.presence());

    expect(Arr.findFirst(presence, ({ identity }) => identity === AGENT)).toStrictEqual(
      Option.some({ identity: AGENT, online: false, unreachable: { at: AT, error: UNREACHABLE, ok: false } }),
    );
  }).pipe(Effect.provide(testCookout({ storage: "sqlite", triggers: "scripted" }))),
);
