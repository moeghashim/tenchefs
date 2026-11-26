import {
  AGENT,
  AT,
  NOT_FOUND,
  OK,
  ONCE,
  OTHER,
  PUBLIC_URL,
  SERVER_ERROR,
  THRICE,
  TOKEN,
  TWICE,
  UNREACHABLE,
  URL_OF,
  anyResult,
  board,
  failed,
  succeeded,
  withStatus,
} from "./trigger-board.ts";
import { Array as Arr, Effect, Option, String as Str } from "effect";
import { answer, testCookout, triggerToken } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { TestClock } from "effect/testing";

it.effect("a mention POSTs the message's link and text to the trigger URL with the token, and stores the result", () =>
  Effect.gen(function* callOnMention() {
    const on = yield* board;
    const id = yield* Effect.map(on.mention(), String);
    const calls = yield* on.cookout.triggers.waitForCalls(ONCE);
    const stored = yield* on.settled(anyResult);

    expect(calls).toStrictEqual([
      {
        headers: [],
        text: `${PUBLIC_URL}/#/channels/grill/threads/${id}/messages/${id}\n\n@${AGENT} look`,
        token: triggerToken(TOKEN),
        url: URL_OF,
      },
    ]);
    expect(stored).toStrictEqual({ trigger: { lastResult: { at: AT, ok: true, status: OK }, url: URL_OF } });
  }).pipe(Effect.provide(testCookout({ publicUrl: PUBLIC_URL, triggers: "scripted" }))),
);

it.effect("the call goes through the HTTP client as a POST of JSON { text } with the token as a bearer", () =>
  Effect.gen(function* realCall() {
    const on = yield* board;
    yield* answer(() => on.matt.client.setTrigger(AGENT, { token: TOKEN, url: `${on.cookout.webhook.url}/fire` }));
    yield* on.mention();
    const calls = yield* on.cookout.webhook.waitForCalls(ONCE);
    const made = Arr.map(calls, ({ body, headers, method, path }) => ({
      authorization: headers["authorization"],
      body,
      method,
      path,
    }));

    expect(made).toStrictEqual([
      {
        authorization: `Bearer ${TOKEN}`,
        body: { text: `${on.cookout.url}/#/channels/grill/threads/1/messages/1\n\n@${AGENT} look` },
        method: "POST",
        path: "/fire",
      },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "no call for the agent's own message, a human, an agent with no trigger URL, or after the URL is cleared",
  () =>
    Effect.gen(function* noCall() {
      const on = yield* board;
      yield* answer(() => on.agent.client.createMessage({ channel: "grill", text: `@${AGENT} note to self` }));
      yield* on.mention(`@matt @${OTHER} look`);
      yield* answer(() => on.matt.client.clearTrigger(AGENT));
      yield* on.mention();
      yield* answer(() => on.matt.client.setTrigger(OTHER, { token: TOKEN, url: URL_OF }));
      yield* on.mention(`@${OTHER} now`);
      const calls = yield* on.cookout.triggers.waitForCalls(ONCE);

      expect(Arr.map(calls, ({ text }) => Str.endsWith(`@${OTHER} now`)(text))).toStrictEqual([true]);
    }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);

it.effect("a Deactivated agent is never called, and is called again once reactivated", () =>
  Effect.gen(function* deactivatedNotCalled() {
    const on = yield* board;
    yield* answer(() => on.matt.client.deactivateIdentity(AGENT));
    yield* on.mention();
    const asleep = yield* on.presence;
    yield* answer(() => on.matt.client.reactivateIdentity(AGENT));
    yield* on.mention(`@${AGENT} back`);
    const calls = yield* on.cookout.triggers.waitForCalls(ONCE);

    expect(asleep).toStrictEqual(Option.some({ identity: AGENT, online: false }));
    expect(Arr.map(calls, ({ text }) => Str.endsWith(`@${AGENT} back`)(text))).toStrictEqual([true]);
  }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);

it.effect("a trigger URL that doesn't answer is given up after 10 s, and never holds up the post", () =>
  Effect.gen(function* slowUrl() {
    const on = yield* board;
    yield* on.cookout.triggers.answerNext(["no answer"]);
    yield* on.mention();
    yield* on.cookout.triggers.waitForCalls(ONCE);
    const before = yield* answer(() => on.matt.client.getTrigger(AGENT));
    yield* TestClock.adjust("10 seconds");
    const after = yield* on.settled(anyResult);

    expect([before, after]).toStrictEqual([
      { trigger: { url: URL_OF } },
      { trigger: { lastResult: { at: AT, error: "no answer within 10 s", ok: false }, url: URL_OF } },
    ]);
  }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);

const throughAStreak = Effect.gen(function* failThenSucceed() {
  const on = yield* board;
  const waking = yield* on.presence;
  yield* on.cookout.triggers.answerNext([{ status: SERVER_ERROR }]);
  yield* on.mentionSettling(failed);
  const unreachable = yield* on.presence;
  yield* on.mentionSettling(succeeded);
  const recovered = yield* on.presence;
  yield* answer(() => on.matt.client.clearTrigger(AGENT));
  const cleared = yield* on.presence;
  return Arr.getSomes([waking, unreachable, recovered, cleared]);
});

it.effect(
  "an agent with a trigger URL wakes on mention, turns Unreachable when a call fails, and green on the next success",
  () =>
    Effect.gen(function* presenceTransitions() {
      const seen = yield* throughAStreak;

      expect(seen).toStrictEqual([
        { identity: AGENT, online: true, wakesOnMention: true },
        { identity: AGENT, online: false, unreachable: { at: AT, ok: false, status: SERVER_ERROR }, warning: true },
        { identity: AGENT, online: true, wakesOnMention: true },
        { identity: AGENT, online: false },
      ]);
    }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);

const liveThenGone = Effect.gen(function* joinWhileUnreachable() {
  const on = yield* board;
  yield* on.cookout.triggers.answerNext([{ error: UNREACHABLE }]);
  yield* on.mentionSettling(failed);
  const joined = yield* Effect.map(
    answer(() => on.matt.client.join({ as: AGENT })),
    ({ agentSessionToken }) => on.cookout.clientFor(agentSessionToken),
  );
  const events = yield* answer(() => joined.watch());
  const live = yield* on.presenceUntil(({ online }) => online);
  yield* answer(() => joined.leave());
  yield* answer(() => events.close());
  const left = yield* on.presenceUntil(({ online }) => !online);
  return { left: Option.getOrThrow(left), live: Option.getOrThrow(live) };
});

it.effect("a live connection turns an Unreachable agent green, and it shows Unreachable again once it leaves", () =>
  Effect.gen(function* liveBeatsUnreachable() {
    const { left, live } = yield* liveThenGone;

    expect(live).toMatchObject({ connection: {}, online: true });
    expect(live).not.toHaveProperty("unreachable");
    expect(left).toMatchObject({ online: false, unreachable: { at: AT, error: UNREACHABLE, ok: false } });
  }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);

const streakInboxes = Effect.gen(function* failTwiceThenSucceed() {
  const on = yield* board;
  yield* on.cookout.triggers.answerNext([{ status: NOT_FOUND }, { status: SERVER_ERROR }]);
  const first = yield* on.mentionSettling(withStatus(NOT_FOUND));
  yield* on.mentionSettling(withStatus(SERVER_ERROR));
  const streak = yield* on.inbox;
  const elsewhere = yield* answer(() => on.ada.client.inbox());
  yield* on.mentionSettling(succeeded);
  const after = yield* on.inbox;
  return { after, elsewhere, first, streak };
});

it.effect("a failure streak raises one alert in the owner's inbox, and the next success clears it", () =>
  Effect.gen(function* oneAlertPerStreak() {
    const { after, elsewhere, first, streak } = yield* streakInboxes;

    expect(Arr.map(streak.alerts, ({ offlineReason, trigger }) => ({ offlineReason, trigger }))).toStrictEqual([
      { offlineReason: "trigger failed", trigger: { message: first, status: NOT_FOUND } },
    ]);
    expect(elsewhere.alerts).toStrictEqual([]);
    expect(Arr.map(after.alerts, ({ backOnlineAt }) => backOnlineAt)).toStrictEqual([AT]);
  }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);

it.effect("a new streak after a success raises a new alert", () =>
  Effect.gen(function* secondStreak() {
    const on = yield* board;
    yield* on.cookout.triggers.answerNext([{ status: SERVER_ERROR }, { status: OK }, { status: SERVER_ERROR }]);
    yield* Effect.forEach([failed, succeeded, failed], (matches) => on.mentionSettling(matches), { concurrency: 1 });
    const calls = yield* on.cookout.triggers.calls;
    const inbox = yield* on.inbox;

    expect(calls).toHaveLength(THRICE);
    expect(Arr.map(inbox.alerts, ({ offlineReason }) => offlineReason)).toStrictEqual(
      Arr.makeBy(TWICE, () => "trigger failed"),
    );
  }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);

const BAD_REQUEST = 400;
const KEPT_CHARACTERS = 200;
const FROM_START = 0;
const HEADER_REQUIRED = "anthropic-version: header is required";
const ENVELOPE = { error: { message: HEADER_REQUIRED, type: "invalid_request_error" }, type: "error" };

const failingWebhook = Effect.gen(function* boardWithAFailingWebhook() {
  const on = yield* board;
  yield* answer(() => on.matt.client.setTrigger(AGENT, { token: TOKEN, url: `${on.cookout.webhook.url}/fire` }));
  return on;
});

it.effect("a failed call keeps the error message of its JSON envelope, and the alert carries it", () =>
  Effect.gen(function* envelopeMessage() {
    const on = yield* failingWebhook;
    yield* on.cookout.webhook.failNext(ONCE, BAD_REQUEST, ENVELOPE);
    const id = yield* on.mentionSettling(failed);
    const stored = yield* on.settled(failed);
    const inbox = yield* on.inbox;

    expect(stored).toMatchObject({
      trigger: { lastResult: { error: HEADER_REQUIRED, ok: false, status: BAD_REQUEST } },
    });
    expect(Arr.map(inbox.alerts, ({ trigger }) => trigger)).toStrictEqual([
      { error: HEADER_REQUIRED, message: id, status: BAD_REQUEST },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a body with no envelope is kept as its text", () =>
  Effect.gen(function* plainBody() {
    const on = yield* failingWebhook;
    yield* on.cookout.webhook.failNext(ONCE, BAD_REQUEST);
    yield* on.mentionSettling(failed);
    const stored = yield* on.settled(failed);

    expect(stored).toMatchObject({ trigger: { lastResult: { error: '{"ok":false}', status: BAD_REQUEST } } });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a long error message is kept as its first 200 characters", () =>
  Effect.gen(function* longBody() {
    const on = yield* board;
    const message = `<html>${Str.repeat(KEPT_CHARACTERS)("x")}</html>`;
    yield* on.cookout.triggers.answerNext([{ message, status: SERVER_ERROR }]);
    yield* on.mentionSettling(failed);
    const stored = yield* on.settled(failed);

    expect(stored).toStrictEqual({
      trigger: {
        lastResult: { at: AT, error: Str.slice(FROM_START, KEPT_CHARACTERS)(message), ok: false, status: SERVER_ERROR },
        url: URL_OF,
      },
    });
  }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);

it.effect("an error message that echoes the token never keeps it", () =>
  Effect.gen(function* echoedToken() {
    const on = yield* board;
    yield* on.cookout.triggers.answerNext([{ message: `bad token ${TOKEN}`, status: BAD_REQUEST }]);
    yield* on.mentionSettling(failed);
    const stored = yield* on.settled(failed);

    expect(stored).toMatchObject({ trigger: { lastResult: { error: "bad token [redacted]" } } });
  }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);
