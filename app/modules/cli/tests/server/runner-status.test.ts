import { Array as Arr, Effect, FileSystem, Option, Path, Record, Schema, String as Str } from "effect";
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
  agentSessionTokenIn,
  answer,
  boardAgent,
  commandLineServices,
  fakeWakeCommand,
  runCookout,
  startRunner,
  testCookout,
  wakeBoard,
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

const EXIT_SUCCESS = 0;
const TWO_LINES = 2;
const REGISTRATION = ".registration.json";
const EXITED_PID = 4_194_305;
const SOME_TEXT: unknown = expect.any(String);
const encode = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

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

function tokenOf(waking: Waking, name: string): string {
  return Option.match(Record.get(waking.agents, name), {
    onNone: () => "no token",
    onSome: ({ agent }) => agent.token,
  });
}

function everyKind(on: WakeBoard): Effect.Effect<Waking, never, Needs> {
  return Effect.gen(function* connectedRunningAndDropped() {
    const waking = yield* runnerWaking(on, ["brigid", "cormac", "dana"]);
    yield* answer(() => on.ada.client.revokeAgentSession("dana"));
    yield* waking.runner.stderrLines(TWO_LINES);
    const feed = yield* watchingAllChannels(on.ada);
    yield* mention(on, "@brigid run for a while");
    yield* wakeRunStarted(feed, "brigid");
    return waking;
  });
}

function statusAsJson(on: WakeBoard): Effect.Effect<Ran, never, Needs> {
  return runCookout({ args: ["runner", "status", "--json"], env: stateFolderOnly(on) });
}

function bothStatuses(on: WakeBoard): Effect.Effect<readonly [Ran, Ran], never, Needs> {
  return Effect.all([statusAsJson(on), runCookout({ args: ["runner", "status"], env: stateFolderOnly(on) })], {
    concurrency: 1,
  });
}

it.effect("runner status --json shows connected, running and dropped agents with their folders", () =>
  Effect.gen(function* statusAsJsonOfEveryKind() {
    const path = yield* Path.Path;
    const on = yield* wakeBoard;
    const waking = yield* everyKind(on);
    const json = yield* statusAsJson(on);
    yield* waking.release;
    const directory = path.resolve(".");

    expect(json).toMatchObject({
      exitCode: EXIT_SUCCESS,
      stdoutJson: {
        dropped: [
          { agent: "dana", code: "agent_session_revoked", directory, droppedAt: SOME_TEXT, message: SOME_TEXT },
        ],
        registrations: [
          { agent: "brigid", directory, state: "running" },
          { agent: "cormac", directory, state: "connected" },
        ],
      },
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("runner status as text shows one line per agent, and neither form prints a token", () =>
  Effect.gen(function* statusAsTextOfEveryKind() {
    const on = yield* wakeBoard;
    const waking = yield* everyKind(on);
    const [json, text] = yield* bothStatuses(on);
    const tokens = yield* agentSessionTokenIn(on.folder);
    yield* waking.release;
    const everything = yield* Effect.orDie(encode([json, text]));

    expect(text.exitCode).toBe(EXIT_SUCCESS);
    expect(text.stdout).toMatch(
      /^brigid +running a wake run +\S[^\n]*\ncormac +connected +\S[^\n]*\ndana +dropped: agent_session_revoked at \S+ +\S[^\n]*\n?$/u,
    );
    expect(Option.map(tokens, (token) => Str.includes(token)(everything))).toStrictEqual(Option.some(false));
    expect(everything).not.toContain(tokenOf(waking, "brigid"));
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

function besideRegistration(on: WakeBoard, suffix: string): Effect.Effect<string, never, Needs> {
  return Effect.gen(function* findBesideRegistration() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const folder = path.join(on.folder, "agent-sessions");
    const names = yield* Effect.orDie(fs.readDirectory(folder));
    const registration = Option.getOrElse(Arr.findFirst(names, Str.endsWith(REGISTRATION)), () => "");
    return path.join(folder, Str.replace(REGISTRATION, suffix)(registration));
  });
}

it.effect("runner status as text with nothing registered says so", () =>
  Effect.gen(function* nothingRegistered() {
    const on = yield* wakeBoard;
    const result = yield* runCookout({ args: ["runner", "status"], env: stateFolderOnly(on) });

    expect(result).toMatchObject({ exitCode: EXIT_SUCCESS, stdout: "No agent is registered with the runner." });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("runner status shows not-running for a runner file whose process has exited", () =>
  Effect.gen(function* runnerExited() {
    const fs = yield* FileSystem.FileSystem;
    const on = yield* wakeBoard;
    yield* joinWaking("brigid", on, { log: "unused.log" });
    const runnerFile = yield* besideRegistration(on, ".runner.json");
    yield* Effect.orDie(fs.writeFileString(runnerFile, `{"pid":${EXITED_PID},"state":"connected"}`));
    const result = yield* statusAsJson(on);

    expect(result).toMatchObject({ stdoutJson: { registrations: [{ agent: "brigid", state: "not-running" }] } });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("runner status with no runner running shows each registration as not running", () =>
  Effect.gen(function* noRunner() {
    const on = yield* wakeBoard;
    yield* joinWaking("brigid", on, { log: "unused.log" });
    const result = yield* statusAsJson(on);

    expect(result).toMatchObject({
      exitCode: EXIT_SUCCESS,
      stdoutJson: { dropped: [], registrations: [{ agent: "brigid", state: "not-running" }] },
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
