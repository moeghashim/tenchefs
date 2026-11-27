import { Array as Arr, Effect, Fiber, FileSystem, Record, String as Str } from "effect";
import type { CommandLineNeeds, EventKind, TestCookout, WakeBoard, WakingAgents } from "../../../testing/server.ts";
import {
  agentSessionTokensIn,
  answer,
  commandLineServices,
  eventsOfKind,
  joinedAgent,
  mention,
  runCookout,
  runnerEventsIn,
  runnerWritten,
  testCookout,
  untilRunnerEvents,
  wakingAgents,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { MessageId } from "../../../messages/index.ts";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";

type Needs = CommandLineNeeds | TestCookout | Scope.Scope;

const SOME_TIME: unknown = expect.stringMatching(/^\d{4}-\d\d-\d\dT/u);
const MENTION_TEXT = "the-mention-text-stays-out-of-logs";
const PRINTED = "printed-by-the-wake-run";
const EXIT_SUCCESS = 0;
const NONE = 0;
const TWO = 2;
const EVERY_KIND: readonly EventKind[] = [
  { agent: "brigid", type: "runner-start" },
  { agent: "brigid", type: "connect" },
  { agent: "brigid", type: "mention" },
  { agent: "brigid", type: "wake-run-start" },
  { agent: "brigid", type: "exit" },
  { agent: "brigid", type: "skip" },
  { agent: "brigid", type: "stand-down" },
  { agent: "cormac", type: "timeout" },
  { agent: "erin", type: "unregister" },
  { agent: "dana", type: "refusal" },
];

function skipOf(waking: WakingAgents): Effect.Effect<MessageId, never, Needs> {
  return Effect.gen(function* skipAnAckedMention() {
    const { on } = waking;
    yield* mention({ ada: on.ada, text: `@brigid ${MENTION_TEXT}` });
    yield* untilRunnerEvents({ agent: "brigid", on, type: "wake-run-start" });
    const second = yield* mention({ ada: on.ada, text: "@brigid answered elsewhere" });
    yield* untilRunnerEvents({ agent: "brigid", count: TWO, on, type: "mention" });
    const { agent } = yield* joinedAgent({ name: "brigid", waking });
    yield* answer(() => agent.client.ack(second));
    yield* waking.release;
    yield* untilRunnerEvents({ agent: "brigid", on, type: "skip" });
    return second;
  });
}

function timeoutOf(on: WakeBoard, name: string): Effect.Effect<MessageId, never, Needs> {
  return Effect.gen(function* runThatTimesOut() {
    const id = yield* mention({ ada: on.ada, text: `@${name} hang` });
    yield* untilRunnerEvents({ agent: name, on, type: "wake-run-start" });
    yield* TestClock.adjust("1 minute");
    yield* untilRunnerEvents({ agent: name, on, type: "timeout" });
    return id;
  });
}

function standDownOf(waking: WakingAgents, name: string): Effect.Effect<void, never, Needs> {
  return Effect.gen(function* takeBackInTheTerminal() {
    const { env } = yield* joinedAgent({ name, waking });
    const watching = yield* Effect.forkScoped(runCookout({ args: ["watch"], env }));
    yield* untilRunnerEvents({ agent: name, on: waking.on, type: "stand-down" });
    yield* Fiber.interrupt(watching);
  });
}

function unregisterOf(on: WakeBoard, name: string): Effect.Effect<number, never, Needs> {
  return Effect.gen(function* unregisterAgent() {
    const result = yield* runCookout({ args: ["runner", "unregister", name], env: { COOKOUT_STATE_DIR: on.folder } });
    yield* untilRunnerEvents({ agent: name, on, type: "unregister" });
    return result.exitCode;
  });
}

function refusalOf(on: WakeBoard, name: string): Effect.Effect<void, never, Needs> {
  return Effect.andThen(
    answer(() => on.ada.client.revokeAgentSession(name)),
    untilRunnerEvents({ agent: name, on, type: "refusal" }),
  );
}

function connected(names: readonly string[]): Effect.Effect<WakingAgents, never, Needs> {
  return Effect.tap(wakingAgents(Arr.map(names, (name) => ({ name }))), ({ on }) =>
    Effect.forEach(names, (name) => untilRunnerEvents({ agent: name, on, type: "connect" }), {
      concurrency: 1,
      discard: true,
    }),
  );
}

interface Written {
  readonly eventLog: string;
  readonly sessionTokens: readonly string[];
  readonly tokens: readonly string[];
  readonly written: string;
}

function writtenBy(waking: WakingAgents): Effect.Effect<Written, never, Needs> {
  return Effect.gen(function* readWhatTheRunnerWrote() {
    const fs = yield* FileSystem.FileSystem;
    const { folder } = waking.on;
    const sessionTokens = yield* agentSessionTokensIn(folder);
    const identityTokens = Arr.map(Record.values(waking.joined), ({ agent }) => agent.token);
    const tokens = [...sessionTokens, ...identityTokens, waking.on.ada.token];
    const eventLog = yield* Effect.orDie(fs.readFileString(`${folder}/runner-events.jsonl`));
    const written = yield* runnerWritten(folder);
    return { eventLog, sessionTokens, tokens, written };
  });
}

function everyEvent(): Effect.Effect<WakingAgents, never, Needs> {
  return Effect.gen(function* everyKindOfEvent() {
    const waking = yield* wakingAgents([
      { name: "brigid", settings: { print: PRINTED }, waits: true },
      { name: "cormac", settings: { hang: true }, timeoutMinutes: 1 },
      { name: "dana" },
      { name: "erin" },
    ]);
    const { on } = waking;
    yield* untilRunnerEvents({ agent: "dana", on, type: "connect" });
    yield* refusalOf(on, "dana");
    yield* skipOf(waking);
    yield* standDownOf(waking, "brigid");
    yield* timeoutOf(on, "cormac");
    yield* unregisterOf(on, "erin");
    return waking;
  });
}

it.effect("the runner logs its start and each agent's connection, each with the time and the agent", () =>
  Effect.gen(function* startAndConnect() {
    const { on } = yield* connected(["brigid", "cormac"]);
    const events = yield* runnerEventsIn(on);

    expect(eventsOfKind({ agent: "brigid", type: "runner-start" })(events)).toMatchObject([{ at: SOME_TIME }]);
    expect(eventsOfKind({ agent: "cormac", type: "runner-start" })(events)).toMatchObject([{ at: SOME_TIME }]);
    expect(eventsOfKind({ agent: "brigid", type: "connect" })(events)).toMatchObject([{ at: SOME_TIME }]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a mention logs its message ID, and its wake run its start, its output file and its exit code", () =>
  Effect.gen(function* mentionAndRun() {
    const { on } = yield* wakingAgents([{ name: "brigid" }]);
    const id = yield* mention({ ada: on.ada, text: `@brigid ${MENTION_TEXT}` });
    const events = yield* untilRunnerEvents({ agent: "brigid", on, type: "exit" });
    const output: unknown = expect.stringContaining(`${on.folder}/runs/brigid/`);

    expect(eventsOfKind({ agent: "brigid", type: "mention" })(events)).toMatchObject([{ at: SOME_TIME, message: id }]);
    expect(eventsOfKind({ agent: "brigid", type: "wake-run-start" })(events)).toMatchObject([
      { at: SOME_TIME, messages: [id], output },
    ]);
    expect(eventsOfKind({ agent: "brigid", type: "exit" })(events)).toMatchObject([
      { at: SOME_TIME, exitCode: EXIT_SUCCESS, messages: [id] },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a wake run that times out logs the timeout", () =>
  Effect.gen(function* timesOut() {
    const { on } = yield* wakingAgents([{ name: "brigid", settings: { hang: true }, timeoutMinutes: 1 }]);
    const id = yield* timeoutOf(on, "brigid");
    const events = yield* runnerEventsIn(on);

    expect(eventsOfKind({ agent: "brigid", type: "timeout" })(events)).toMatchObject([
      { at: SOME_TIME, messages: [id], timedOutAfterMinutes: 1 },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a waiting run whose mentions were all acked meanwhile logs a skip", () =>
  Effect.gen(function* skipped() {
    const waking = yield* wakingAgents([{ name: "brigid", waits: true }]);
    const second = yield* skipOf(waking);
    const events = yield* runnerEventsIn(waking.on);

    expect(eventsOfKind({ agent: "brigid", type: "skip" })(events)).toMatchObject([
      { at: SOME_TIME, messages: [second] },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a terminal watch taking the agent back logs a stand-down", () =>
  Effect.gen(function* standsDown() {
    const waking = yield* connected(["brigid"]);
    yield* standDownOf(waking, "brigid");
    const events = yield* runnerEventsIn(waking.on);

    expect(eventsOfKind({ agent: "brigid", type: "stand-down" })(events)).toMatchObject([{ at: SOME_TIME }]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("unregistering an agent logs its unregister", () =>
  Effect.gen(function* unregistered() {
    const { on } = yield* connected(["brigid"]);
    const exitCode = yield* unregisterOf(on, "brigid");
    const events = yield* runnerEventsIn(on);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(eventsOfKind({ agent: "brigid", type: "unregister" })(events)).toMatchObject([{ at: SOME_TIME }]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a refused agent session logs the refusal with its code", () =>
  Effect.gen(function* refused() {
    const { on } = yield* connected(["brigid"]);
    yield* refusalOf(on, "brigid");
    const events = yield* runnerEventsIn(on);

    expect(eventsOfKind({ agent: "brigid", type: "refusal" })(events)).toMatchObject([
      { at: SOME_TIME, dropped: true, error: { code: "agent_session_revoked" } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("across every event, no file the runner wrote holds a token, and its event log holds no mention text", () =>
  Effect.gen(function* noSecrets() {
    const waking = yield* everyEvent();
    const events = yield* runnerEventsIn(waking.on);
    const { eventLog, sessionTokens, tokens, written } = yield* writtenBy(waking);

    expect(Arr.filter(EVERY_KIND, (kind) => eventsOfKind(kind)(events).length === NONE)).toStrictEqual([]);
    expect(sessionTokens.length).toBeGreaterThanOrEqual(TWO);
    expect(written).toContain(PRINTED);
    expect(Arr.filter(tokens, (token) => Str.includes(token)(written))).toStrictEqual([]);
    expect(eventLog).not.toContain(MENTION_TEXT);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
