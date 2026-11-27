import { Array as Arr, Effect, FileSystem, Option, Path, Record, String as Str } from "effect";
import type { BoardAgent, CommandLineNeeds, TestCookout, WakeBoard } from "../../../testing/server.ts";
import {
  WAKE_CHANNEL,
  answer,
  boardAgent,
  commandLineServices,
  runCookout,
  startRunner,
  testCookout,
  wakeBoard,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";

type Needs = CommandLineNeeds | TestCookout | Scope.Scope;

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const PRIVATE_FOLDER = 0o700;
const TWO_LINES = 2;
const THREE_LINES = 3;
const MISSING_COMMAND = "/nonexistent/wake-command";
const REGISTRATION = ".registration.json";

interface JoinedBrigid {
  readonly brigid: BoardAgent;
  readonly on: WakeBoard;
}

function joinedBrigid(wake: readonly string[]): Effect.Effect<JoinedBrigid, never, Needs> {
  return Effect.gen(function* joinBrigid() {
    const on = yield* wakeBoard;
    const brigid = yield* boardAgent({ board: on, name: "brigid" });
    const result = yield* runCookout({ args: ["join", "--as", "brigid", "--wake", "--", ...wake], env: brigid.env });

    expect(result).toMatchObject({ exitCode: EXIT_SUCCESS });

    return { brigid, on };
  });
}

it.effect.each([
  { args: ["join", "--as", "brigid", "--", "claude"], how: "a wake command without --wake" },
  { args: ["join", "--as", "brigid", "--print-env", "--wake", "--", "claude"], how: "--wake with --print-env" },
  { args: ["runner", "register"], how: "runner register with no wake command" },
  {
    args: ["runner", "register", "--timeout", "0", "--", "claude"],
    how: "runner register with a timeout under a minute",
  },
])("$how is refused as usage", ({ args }: { readonly args: readonly string[] }) =>
  Effect.gen(function* refusedAsUsage() {
    const on = yield* wakeBoard;
    const { env } = yield* boardAgent({ board: on, name: "brigid" });
    const result = yield* runCookout({ args, env });

    expect(result).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "usage" } } });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("runner register outside a harness session is refused with not_joined", () =>
  Effect.gen(function* outsideHarness() {
    const on = yield* wakeBoard;
    const result = yield* runCookout({
      args: ["runner", "register", "--", "claude"],
      env: { COOKOUT_STATE_DIR: on.folder },
    });

    expect(result).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "not_joined" } } });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect.each([
  { how: "with no state folder", stateFolder: false },
  { how: "with a state folder no session has joined in", stateFolder: true },
])("runner start $how fails with not_registered", ({ stateFolder }: { readonly stateFolder: boolean }) =>
  Effect.gen(function* nothingRegistered() {
    const on = yield* wakeBoard;
    const env = Record.filter({ COOKOUT_STATE_DIR: on.folder }, () => stateFolder);
    const result = yield* runCookout({ args: ["runner", "start"], env });

    expect(result).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "not_registered" } } });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("runner start on a damaged registration fails with agent_session_state_damaged", () =>
  Effect.gen(function* damagedRegistration() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const on = yield* wakeBoard;
    const folder = path.join(on.folder, "agent-sessions");
    yield* Effect.orDie(fs.makeDirectory(folder, { mode: PRIVATE_FOLDER }));
    yield* Effect.orDie(fs.writeFileString(path.join(folder, "abc.registration.json"), "{not json"));
    const result = yield* runCookout({ args: ["runner", "start"], env: { COOKOUT_STATE_DIR: on.folder } });

    expect(result).toMatchObject({
      exitCode: EXIT_FAILURE,
      stderrJson: { error: { code: "agent_session_state_damaged" } },
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a registration whose session was revoked before the runner started is dropped, and the runner stops", () =>
  Effect.gen(function* sessionRevoked() {
    const { on } = yield* joinedBrigid(["claude"]);
    yield* answer(() => on.ada.client.revokeAgentSession("brigid"));
    const runner = yield* startRunner({ COOKOUT_STATE_DIR: on.folder });
    const errors = yield* runner.stderrLines(THREE_LINES);
    const status = yield* runCookout({ args: ["runner", "status", "--json"], env: { COOKOUT_STATE_DIR: on.folder } });

    expect(errors).toMatchObject([
      { agent: "brigid", dropped: true, error: { code: "agent_session_revoked" } },
      { waking: ["brigid"] },
      { error: { code: "cli_error" } },
    ]);
    expect(status).toMatchObject({
      stdoutJson: { dropped: [{ agent: "brigid", code: "agent_session_revoked" }], registrations: [] },
    });
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

it.effect("a registration whose agent session state is gone is dropped with not_joined, and the runner stops", () =>
  Effect.gen(function* stateGone() {
    const fs = yield* FileSystem.FileSystem;
    const { on } = yield* joinedBrigid(["claude"]);
    const state = yield* besideRegistration(on, ".json");
    yield* Effect.orDie(fs.remove(state));
    const runner = yield* startRunner({ COOKOUT_STATE_DIR: on.folder });
    const errors = yield* runner.stderrLines(THREE_LINES);

    expect(errors).toMatchObject([
      { agent: "brigid", dropped: true, error: { code: "not_joined" } },
      { waking: ["brigid"] },
      { error: { code: "cli_error" } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a wake command that can't be started is reported as wake_command_failed, and the runner keeps going", () =>
  Effect.gen(function* cannotStart() {
    const { on } = yield* joinedBrigid([MISSING_COMMAND]);
    const runner = yield* startRunner({ COOKOUT_STATE_DIR: on.folder });
    yield* answer(() => on.ada.client.createMessage({ channel: WAKE_CHANNEL, text: "@brigid hello" }));
    const errors = yield* runner.stderrLines(TWO_LINES);
    const status = yield* runCookout({ args: ["runner", "status"], env: { COOKOUT_STATE_DIR: on.folder } });

    expect(errors).toMatchObject([{ waking: ["brigid"] }, { agent: "brigid", error: { code: "wake_command_failed" } }]);
    expect(status.stdout).toMatch(/^brigid .* last wake run \S+: failed: wake_command_failed, output in \S+$/mu);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
