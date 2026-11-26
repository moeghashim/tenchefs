import { AGENT, AT, OK, ONCE, URL_OF, board, succeeded } from "./trigger-board.ts";
import { Array as Arr, Effect, String as Str } from "effect";
import { answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { TestClock } from "effect/testing";
import type { TriggerResult } from "../../index.ts";

const LIVE = "agent_session_live";

function skipped(result: TriggerResult): boolean {
  return result.skipped === LIVE;
}

function called(result: TriggerResult): boolean {
  return succeeded(result) && !("skipped" in result);
}

it.effect("a mention of an agent with a live agent session calls no trigger URL, and reaches its inbox", () =>
  Effect.gen(function* liveSessionSkips() {
    const on = yield* board;
    const session = yield* answer(() => on.agent.client.join({ as: AGENT }));
    const id = yield* on.mention();
    const stored = yield* on.settled(skipped);
    const inbox = yield* answer(() => on.cookout.clientFor(session.agentSessionToken).inbox());
    const calls = yield* on.cookout.triggers.calls;

    expect(stored).toStrictEqual({ trigger: { lastResult: { at: AT, ok: true, skipped: LIVE }, url: URL_OF } });
    expect(Arr.map(inbox.items, ({ message }) => message.id)).toStrictEqual([id]);
    expect(calls).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);

it.effect("once the agent session is revoked, a mention calls the trigger URL again", () =>
  Effect.gen(function* revokedCalls() {
    const on = yield* board;
    yield* answer(() => on.agent.client.join({ as: AGENT }));
    yield* on.mentionSettling(skipped);
    yield* answer(() => on.matt.client.revokeAgentSession(AGENT));
    yield* on.mention(`@${AGENT} back`);
    const calls = yield* on.cookout.triggers.waitForCalls(ONCE);
    const stored = yield* on.settled(called);

    expect(Arr.map(calls, ({ text }) => Str.endsWith(`@${AGENT} back`)(text))).toStrictEqual([true]);
    expect(stored).toStrictEqual({ trigger: { lastResult: { at: AT, ok: true, status: OK }, url: URL_OF } });
  }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);

it.effect("once the agent session has expired, a mention calls the trigger URL again", () =>
  Effect.gen(function* expiredCalls() {
    const on = yield* board;
    yield* answer(() => on.agent.client.join({ as: AGENT, idleExpiry: "1m" }));
    yield* TestClock.adjust("2 minutes");
    yield* on.mention(`@${AGENT} back`);
    const calls = yield* on.cookout.triggers.waitForCalls(ONCE);

    expect(Arr.map(calls, ({ text }) => Str.endsWith(`@${AGENT} back`)(text))).toStrictEqual([true]);
  }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);
