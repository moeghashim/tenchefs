import { Array as Arr, Effect, FileSystem, Option, Path, String as Str } from "effect";
import type {
  BoardAgent,
  CommandLineNeeds,
  FakeWakeSettings,
  StartedRunner,
  TestCookout,
  WakeBoard,
} from "../../../testing/server.ts";
import {
  boardAgent,
  commandLineServices,
  fakeWakeCommand,
  joinWaking,
  mention,
  repliesTo,
  runCookout,
  startRunner,
  testCookout,
  untilRunnerEvents,
  wakeBoard,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { MessageId } from "../../../messages/index.ts";
import type { Scope } from "effect";

type Needs = CommandLineNeeds | TestCookout | Scope.Scope;

const EXIT_SUCCESS = 0;
const ONE_RUN = 1;
const REGISTRATION = ".registration.json";

function register(joined: BoardAgent, settings: FakeWakeSettings): Effect.Effect<void, never, Needs> {
  return Effect.gen(function* registerWakeCommand() {
    const wake = yield* fakeWakeCommand(settings);
    const result = yield* runCookout({ args: ["runner", "register", "--", ...wake], env: joined.env });

    expect(result).toMatchObject({ exitCode: EXIT_SUCCESS });
  });
}

function logIn(on: WakeBoard): Effect.Effect<string, never, Path.Path> {
  return Effect.map(Path.Path, (path) => path.join(on.folder, "wake.log"));
}

function statusAsJson(on: WakeBoard): Effect.Effect<Effect.Success<ReturnType<typeof runCookout>>, never, Needs> {
  return runCookout({ args: ["runner", "status", "--json"], env: { COOKOUT_STATE_DIR: on.folder } });
}

function registeredLater(on: WakeBoard, log: string): Effect.Effect<MessageId, never, Needs> {
  return Effect.gen(function* joinMentionAndRegister() {
    const cormac = yield* boardAgent({ board: on, name: "cormac" });
    yield* runCookout({ args: ["join", "--as", "cormac"], env: cormac.env });
    const waiting = yield* mention({ ada: on.ada, text: "@cormac are you there?" });
    yield* register(cormac, { ack: true, log, reply: "caught up" });
    return waiting;
  });
}

interface PickedUp {
  readonly connects: readonly unknown[];
  readonly lines: readonly unknown[];
  readonly replies: readonly string[];
  readonly status: unknown;
}

function pickedUp(on: WakeBoard, runner: StartedRunner, waiting: MessageId): Effect.Effect<PickedUp, never, Needs> {
  return Effect.gen(function* afterPickingUp() {
    const lines = yield* runner.stdoutLines(ONE_RUN);
    const connects = yield* untilRunnerEvents({ agent: "cormac", on, type: "connect" });
    const replies = yield* repliesTo({ ada: on.ada, id: waiting });
    const status = yield* statusAsJson(on);
    return { connects: Arr.map(connects, ({ type }) => type), lines, replies, status };
  });
}

it.effect("an agent registered while the runner is running is connected and caught up without a restart", () =>
  Effect.gen(function* registeredWhileRunning() {
    const on = yield* wakeBoard;
    const log = yield* logIn(on);
    yield* joinWaking({ name: "brigid", on, settings: { ack: true, log } });
    const runner = yield* startRunner({ COOKOUT_STATE_DIR: on.folder });
    const waiting = yield* registeredLater(on, log);
    const { connects, lines, replies, status } = yield* pickedUp(on, runner, waiting);

    expect(lines).toStrictEqual([{ agent: "cormac", exitCode: 0, messages: [waiting], type: "wake-run" }]);
    expect(connects).toContain("connect");
    expect(replies).toStrictEqual(["cormac: caught up"]);
    expect(status).toMatchObject({
      stdoutJson: {
        registrations: [
          { agent: "brigid", state: "connected" },
          { agent: "cormac", state: "connected" },
        ],
      },
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("an agent registered again with another wake command is woken with the new one by the running runner", () =>
  Effect.gen(function* registeredAgain() {
    const on = yield* wakeBoard;
    const log = yield* logIn(on);
    const brigid = yield* joinWaking({ name: "brigid", on, settings: { ack: true, log, reply: "old command" } });
    const runner = yield* startRunner({ COOKOUT_STATE_DIR: on.folder });
    yield* register(brigid, { ack: true, log, reply: "new command" });
    const message = yield* mention({ ada: on.ada, text: "@brigid which command?" });
    const lines = yield* runner.stdoutLines(ONE_RUN);
    const replies = yield* repliesTo({ ada: on.ada, id: message });

    expect(lines).toStrictEqual([{ agent: "brigid", exitCode: 0, messages: [message], type: "wake-run" }]);
    expect(replies).toStrictEqual(["brigid: new command"]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

function onlyRunnerFile(on: WakeBoard): Effect.Effect<string, never, Needs> {
  return Effect.gen(function* findRunnerFile() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const folder = path.join(on.folder, "agent-sessions");
    const names = yield* Effect.orDie(fs.readDirectory(folder));
    const registration = Option.getOrElse(Arr.findFirst(names, Str.endsWith(REGISTRATION)), () => "");
    return path.join(folder, Str.replace(REGISTRATION, ".runner.json")(registration));
  });
}

it.effect("runner status never says no runner is running while a runner holds another registration", () =>
  Effect.gen(function* runnerRunsElsewhere() {
    const fs = yield* FileSystem.FileSystem;
    const on = yield* wakeBoard;
    yield* joinWaking({ name: "brigid", on, settings: { log: "unused.log" } });
    const runnerFile = yield* onlyRunnerFile(on);
    yield* Effect.orDie(fs.writeFileString(runnerFile, `{"pid":${String(process.pid)},"state":"connected"}`));
    yield* joinWaking({ name: "cormac", on, settings: { log: "unused.log" } });
    const json = yield* statusAsJson(on);
    const text = yield* runCookout({ args: ["runner", "status"], env: { COOKOUT_STATE_DIR: on.folder } });

    expect(json).toMatchObject({
      stdoutJson: {
        registrations: [
          { agent: "brigid", state: "connected" },
          { agent: "cormac", state: "not-connected" },
        ],
      },
    });
    expect(text.stdout).not.toContain("no runner is running");
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
