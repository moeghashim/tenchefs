import { Array as Arr, Effect, FileSystem, Path, Stdio, Stream } from "effect";
import type {
  BoardAgent,
  CliResult,
  CommandLineNeeds,
  CookoutRunLine,
  FakeWakeSettings,
  TestCookout,
  WakeBoard,
} from "../../../testing/server.ts";
import {
  answer,
  boardAgent,
  commandLineServices,
  cookoutRunsIn,
  joinWaking,
  mention,
  runCookout,
  startRunner,
  testCookout,
  wakeBoard,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";

type Env = Readonly<Record<string, string>>;

interface WokenWithLogin {
  readonly cormac: BoardAgent;
  readonly identities: readonly string[];
  readonly ran: readonly CookoutRunLine[];
}

const ONE_RUN = 1;
const EXIT_FAILURE = 1;
const encoder = new TextEncoder();
const JOIN_CORMAC = { args: ["join", "--as", "cormac", "--force"], env: { CLAUDE_CODE_SESSION_ID: "another-session" } };
const CREATE_DORA = {
  args: ["identity", "create", "dora", "--kind", "agent", "--display-name", "Dora"],
  env: { CLAUDECODE: "" },
};
const POST = { args: ["message", "post", "grill", "still brigid"], env: {} };
const REFUSED = { exitCode: EXIT_FAILURE, stderr: { error: { code: "wake_run_no_login" } } };

type Runs = NonNullable<FakeWakeSettings["runs"]>;

function logIn(env: Env, token: string): Effect.Effect<CliResult, never, CommandLineNeeds> {
  const stdin = Stdio.layerTest({ stdin: Stream.make(encoder.encode(`${token}\n`)) });
  return runCookout({ args: ["login", "--token"], env }).pipe(Effect.provide(stdin));
}

type Needs = CommandLineNeeds | TestCookout | Scope.Scope;

interface LoggedInBoard {
  readonly cormac: BoardAgent;
  readonly home: string;
  readonly on: WakeBoard;
}

const boardWithAdasLogin: Effect.Effect<LoggedInBoard, never, Needs> = Effect.gen(function* logInAndJoinCormac() {
  const fs = yield* FileSystem.FileSystem;
  const on = yield* wakeBoard;
  const home = yield* Effect.orDie(fs.makeTempDirectoryScoped({ prefix: "cookout-home-" }));
  yield* logIn({ COOKOUT_URL: on.url, HOME: home }, on.ada.token);
  const cormac = yield* boardAgent({ board: on, name: "cormac" });
  yield* runCookout({ args: ["join", "--as", "cormac"], env: cormac.env });
  return { cormac, home, on };
});

function wokenWithLogin(runs: Runs): Effect.Effect<WokenWithLogin, never, Needs> {
  return Effect.gen(function* wakeBrigidWithAdasLogin() {
    const path = yield* Path.Path;
    const { cormac, home, on } = yield* boardWithAdasLogin;
    const log = path.join(on.folder, "wake.log");
    yield* joinWaking({ name: "brigid", on, settings: { ack: true, log, runs } });
    const runner = yield* startRunner({ COOKOUT_STATE_DIR: on.folder, HOME: home });
    yield* mention({ ada: on.ada, text: "@brigid join cormac" });
    yield* runner.stdoutLines(ONE_RUN);
    const listed = yield* answer(() => on.ada.client.listIdentities());
    const identities = Arr.map(listed.identities, ({ name }) => name);
    return { cormac, identities, ran: yield* cookoutRunsIn(log) };
  });
}

it.effect(
  "in a wake run, join --as another owned agent with the person's Login is refused, and that agent's session is untouched",
  () =>
    Effect.gen(function* wakeRunJoinsWithLogin() {
      const { cormac, ran } = yield* wokenWithLogin([JOIN_CORMAC]);
      const stillCormac = yield* runCookout({ args: ["whoami"], env: cormac.env });

      expect(ran).toMatchObject([REFUSED]);
      expect(stillCormac).toMatchObject({
        exitCode: 0,
        stdoutJson: { identity: { name: "cormac" }, source: "agent session token" },
      });
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("in a wake run with its harness markers stripped, a verb that would act as the person is refused", () =>
  Effect.gen(function* wakeRunActsAsPerson() {
    const { identities, ran } = yield* wokenWithLogin([CREATE_DORA]);

    expect(ran).toMatchObject([REFUSED]);
    expect(identities).not.toContain("dora");
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect(
  "in a wake run with the person's Login, a post with the woken agent's agent session posts as that agent",
  () =>
    Effect.gen(function* wakeRunPostsAsAgent() {
      const { ran } = yield* wokenWithLogin([POST]);

      expect(ran).toMatchObject([
        { exitCode: 0, stdout: { message: { author: { name: "brigid" }, text: "still brigid" } } },
      ]);
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("with COOKOUT_WAKE_RUN=1 and a saved Login, a verb that would send the Login is refused", () =>
  Effect.gen(function* wakeRunMarked() {
    const { home, on } = yield* boardWithAdasLogin;
    const env = { COOKOUT_URL: on.url, COOKOUT_WAKE_RUN: "1", HOME: home };

    const created = yield* runCookout({
      args: ["identity", "create", "dora", "--kind", "agent", "--display-name", "Dora"],
      env,
    });
    const unmarked = yield* runCookout({ args: ["whoami"], env: { ...env, COOKOUT_WAKE_RUN: "" } });

    expect(created).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "wake_run_no_login" } } });
    expect(unmarked).toMatchObject({ exitCode: 0, stdoutJson: { identity: { name: "ada" }, source: "login" } });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
