import { Array as Arr, Effect, FileSystem, Option, Path, Record } from "effect";
import type {
  BoardAgent,
  CommandLineNeeds,
  FakeWakeSettings,
  StartedRunner,
  TestCookoutService,
  WakeBoard,
} from "../../../testing/server.ts";
import type { CookoutEvent, Presence } from "../../../sdk/index.ts";
import {
  TestCookout,
  WAKE_CHANNEL,
  answer,
  boardAgent,
  commandLineServices,
  fakeWakeCommand,
  registeredAgentsIn,
  runCookout,
  startRunner,
  testCookout,
  wakeBoard,
  wakeEvents,
  watchingAllChannels,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";

type Needs = CommandLineNeeds | TestCookout | Scope.Scope;
type Feed = AsyncIterator<CookoutEvent, unknown>;
type Env = Readonly<Record<string, string>>;
type Ran = Effect.Success<ReturnType<typeof runCookout>>;

interface Waking {
  readonly agents: Readonly<Record<string, BoardAgent>>;
  readonly cookout: TestCookoutService;
  readonly log: string;
  readonly on: WakeBoard;
  readonly release: Effect.Effect<void>;
  readonly runner: StartedRunner;
}

interface Unregistered {
  readonly heard: number;
  readonly ignored: number;
  readonly left: readonly string[];
  readonly lines: readonly unknown[];
  readonly woken: readonly number[];
}

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const ONE_RUN = 1;
const TWO_LINES = 2;
const NO_ENV: Env = {};
const SOME_TEXT: unknown = expect.any(String);

function joinWaking(name: string, on: WakeBoard, settings: FakeWakeSettings): Effect.Effect<BoardAgent, never, Needs> {
  return Effect.gen(function* joinAndRegister() {
    const joined = yield* boardAgent({ board: on, name });
    const wake = yield* fakeWakeCommand(settings);
    const result = yield* runCookout({ args: ["join", "--as", name, "--wake", "--", ...wake], env: joined.env });

    expect(result).toMatchObject({ exitCode: EXIT_SUCCESS });

    return joined;
  });
}

function runnerWaking(on: WakeBoard, names: readonly string[]): Effect.Effect<Waking, never, Needs> {
  return Effect.gen(function* startRunnerForAgents() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cookout = yield* TestCookout;
    const log = path.join(on.folder, "wake.log");
    const releaseFile = path.join(on.folder, "release");
    const joined = yield* Effect.forEach(
      names,
      (name) => Effect.map(joinWaking(name, on, { log, waitFor: releaseFile }), (agent) => [name, agent] as const),
      { concurrency: 1 },
    );
    const runner = yield* startRunner({ COOKOUT_STATE_DIR: on.folder });
    const release = Effect.orDie(fs.writeFileString(releaseFile, "go"));
    return { agents: Record.fromEntries(joined), cookout, log, on, release, runner };
  });
}

function mention(on: WakeBoard, text: string): Effect.Effect<number> {
  return Effect.map(
    answer(() => on.ada.client.createMessage({ channel: WAKE_CHANNEL, text })),
    ({ message }) => message.id,
  );
}

function runningPresenceOf(name: string) {
  return (next: Readonly<IteratorResult<CookoutEvent, unknown>>): Option.Option<Presence> => {
    if (next.done === true || next.value.type !== "presence") {
      return Option.none();
    }
    const { presence } = next.value;
    return Option.liftPredicate(presence, () => presence.identity === name && presence.wakesOnMention !== true);
  };
}

function wakeRunStarted(feed: Feed, name: string): Effect.Effect<void> {
  return answer(() => feed.next()).pipe(
    Effect.map(runningPresenceOf(name)),
    Effect.repeat({ until: Option.isSome }),
    Effect.asVoid,
  );
}

function stateFolderOnly(on: WakeBoard): Env {
  return { COOKOUT_STATE_DIR: on.folder };
}

function envOf(waking: Waking, asAgent: boolean): Env {
  if (!asAgent) {
    return stateFolderOnly(waking.on);
  }
  return Option.match(Record.get(waking.agents, "brigid"), { onNone: () => NO_ENV, onSome: ({ env }) => env });
}

function afterUnregistering(waking: Waking): Effect.Effect<Unregistered, never, Needs> {
  return Effect.gen(function* mentionBothAgents() {
    yield* waking.cookout.liveConnectionsClosed("brigid");
    const left = yield* registeredAgentsIn(waking.on.folder);
    const ignored = yield* mention(waking.on, "@brigid are you still there?");
    const heard = yield* mention(waking.on, "@cormac you are");
    yield* waking.release;
    const lines = yield* waking.runner.stdoutLines(ONE_RUN);
    const events = yield* wakeEvents(waking.log);
    return { heard, ignored, left, lines, woken: Arr.flatMap(events, ([, messages]) => messages) };
  });
}

function unregisterWhileRunning(
  waking: Waking,
): Effect.Effect<{ readonly message: number; readonly result: Ran }, never, Needs> {
  return Effect.gen(function* unregisterMidRun() {
    const feed = yield* watchingAllChannels(waking.on.ada);
    const message = yield* mention(waking.on, "@brigid take your time");
    yield* wakeRunStarted(feed, "brigid");
    const result = yield* runCookout({ args: ["runner", "unregister", "brigid"], env: stateFolderOnly(waking.on) });
    return { message, result };
  });
}

function statusAsJson(on: WakeBoard): Effect.Effect<Ran, never, Needs> {
  return runCookout({ args: ["runner", "status", "--json"], env: stateFolderOnly(on) });
}

it.effect.each([
  { args: ["runner", "unregister", "brigid"], asAgent: false, how: "runner unregister" },
  { args: ["leave"], asAgent: true, how: "leave" },
])(
  "after $how the registration is gone, the runner closes the agent's connection, and a new mention doesn't wake it",
  ({ args, asAgent }: { readonly args: readonly string[]; readonly asAgent: boolean }) =>
    Effect.gen(function* unregistered() {
      const on = yield* wakeBoard;
      const waking = yield* runnerWaking(on, ["brigid", "cormac"]);
      const result = yield* runCookout({ args, env: envOf(waking, asAgent) });
      const { heard, ignored, left, lines, woken } = yield* afterUnregistering(waking);

      expect(result).toMatchObject({ exitCode: EXIT_SUCCESS });
      expect(left).toStrictEqual(["cormac"]);
      expect(lines).toStrictEqual([{ agent: "cormac", exitCode: 0, messages: [heard], type: "wake-run" }]);
      expect(woken).not.toContain(ignored);
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a wake run in progress finishes when its agent is unregistered", () =>
  Effect.gen(function* runFinishes() {
    const on = yield* wakeBoard;
    const waking = yield* runnerWaking(on, ["brigid"]);
    const { message, result } = yield* unregisterWhileRunning(waking);
    yield* waking.cookout.liveConnectionsClosed("brigid");
    yield* waking.release;
    const lines = yield* waking.runner.stdoutLines(ONE_RUN);
    const events = yield* wakeEvents(waking.log);

    expect(result).toMatchObject({ exitCode: EXIT_SUCCESS });
    expect(lines).toStrictEqual([{ agent: "brigid", exitCode: 0, messages: [message], type: "wake-run" }]);
    expect(events).toStrictEqual([
      ["start", [message]],
      ["end", [message]],
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("runner unregister for an agent with no registration is refused with not_registered", () =>
  Effect.gen(function* nothingToUnregister() {
    const on = yield* wakeBoard;
    yield* joinWaking("brigid", on, { log: "unused.log" });
    const result = yield* runCookout({ args: ["runner", "unregister", "cormac"], env: stateFolderOnly(on) });
    const left = yield* registeredAgentsIn(on.folder);

    expect(result).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "not_registered" } } });
    expect(left).toStrictEqual(["brigid"]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a revoked agent session drops its registration, and runner status shows it dropped with the reason", () =>
  Effect.gen(function* revoked() {
    const on = yield* wakeBoard;
    const { runner } = yield* runnerWaking(on, ["brigid", "cormac"]);
    yield* answer(() => on.ada.client.revokeAgentSession("brigid"));
    const errors = yield* runner.stderrLines(TWO_LINES);
    const left = yield* registeredAgentsIn(on.folder);
    const status = yield* statusAsJson(on);

    expect(Arr.drop(errors, ONE_RUN)).toMatchObject([{ agent: "brigid", dropped: true }]);
    expect(left).toStrictEqual(["cormac"]);
    expect(status).toMatchObject({
      exitCode: EXIT_SUCCESS,
      stdoutJson: {
        dropped: [{ agent: "brigid", code: "agent_session_revoked", droppedAt: SOME_TEXT }],
        registrations: [{ agent: "cormac", state: "connected" }],
      },
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
