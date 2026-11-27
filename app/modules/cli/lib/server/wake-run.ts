import { Array as Arr, Duration, Effect, Fiber, Option, Record, Schema, String as Str, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import type { FileSystem, Path } from "effect";
import type { RunOutput, RunnerLog } from "./runner-log.ts";
import { home, proxyEnvironment, wakeRunVariable } from "../../../config/server.ts";
import { printErrorLine, printLine } from "./output.ts";
import type { InboxItem } from "../../../sdk/index.ts";
import type { Registration } from "./registrations.ts";
import type { WakeRunFailure } from "../../../presence/index.ts";
import { runnerLog } from "./runner-log.ts";
import { stateFolderPath } from "./state-folder.ts";

interface RunPlace {
  readonly log: RunnerLog;
  readonly stateFolder: string;
}

interface Woken {
  readonly items: readonly InboxItem[];
  readonly place: RunPlace;
  readonly registration: Registration;
}

const runPlace: Effect.Effect<Option.Option<RunPlace>, never, FileSystem.FileSystem | Path.Path> = Effect.flatMap(
  stateFolderPath,
  (folder) =>
    Effect.transposeOption(
      Option.map(folder, (stateFolder) => Effect.map(runnerLog(stateFolder), (log) => ({ log, stateFolder }))),
    ),
);

const DEFAULT_TIMEOUT_MINUTES = 10;
const SUCCESS = 0;
const FORCE_KILL_AFTER = "5 seconds";
const DRAIN_AFTER_EXIT = "1 second";

const encodeLine = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

function setOnly(entries: readonly (readonly [string, string])[]): Readonly<Record<string, string>> {
  return Record.fromEntries(Arr.filter(entries, ([, value]) => Str.isNonEmpty(value)));
}

function runEnvironment({ place, registration }: Woken): Effect.Effect<Readonly<Record<string, string>>> {
  return Effect.gen(function* environmentOfRun() {
    const homeFolder = yield* home;
    const proxies = yield* proxyEnvironment;
    return setOnly([
      ["COOKOUT_STATE_DIR", place.stateFolder],
      ["COOKOUT_URL", registration.url],
      [wakeRunVariable, "1"],
      ["HOME", homeFolder],
      ["HTTPS_PROXY", proxies.httpsProxy],
      ["HTTP_PROXY", proxies.httpProxy],
      ["NO_PROXY", proxies.noProxy],
      ["PATH", registration.path],
    ]);
  }).pipe(Effect.orDie);
}

interface Woke {
  readonly agent: string;
  readonly messages: readonly number[];
}

function wakeFailed(woke: Woke, log: RunnerLog) {
  return (failed: { readonly message: string }): Effect.Effect<Option.Option<WakeRunFailure>> => {
    const error = { code: "wake_command_failed", message: failed.message };
    return Effect.andThen(
      log.record(woke.agent, { error, messages: woke.messages, type: "wake-failed" }),
      Effect.as(printErrorLine({ ...woke, error }), Option.none()),
    );
  };
}

function exited(woke: Woke, log: RunnerLog, timedOutAfterMinutes: number) {
  const { agent, messages } = woke;
  return (exitCode: Option.Option<number>): Effect.Effect<Option.Option<WakeRunFailure>> =>
    Option.match(exitCode, {
      onNone: () =>
        log
          .record(agent, { messages, timedOutAfterMinutes, type: "timeout" })
          .pipe(
            Effect.andThen(printLine({ ...woke, timedOutAfterMinutes, type: "wake-run" })),
            Effect.as(Option.some({ timedOutAfterMinutes })),
          ),
      onSome: (code) =>
        log
          .record(agent, { exitCode: code, messages, type: "exit" })
          .pipe(
            Effect.andThen(printLine({ ...woke, exitCode: code, type: "wake-run" })),
            Effect.as(Option.liftPredicate({ exitCode: code }, () => code !== SUCCESS)),
          ),
    });
}

function commandOf(woken: Woken): Effect.Effect<ChildProcess.Command> {
  const { items, registration } = woken;
  return Effect.gen(function* makeWakeCommand() {
    const env = yield* runEnvironment(woken);
    const line = yield* Effect.orDie(encodeLine({ items }));
    const [command, ...args] = registration.wakeCommand;
    return ChildProcess.make(command, args, {
      cwd: registration.directory,
      env,
      extendEnv: false,
      forceKillAfter: FORCE_KILL_AFTER,
      stdin: { stream: Stream.encodeText(Stream.make(`${line}\n`)) },
    });
  });
}

function startedRun(log: RunnerLog, { agent, messages }: Woke) {
  return ({ file }: RunOutput): Effect.Effect<void> =>
    log.record(agent, { messages, output: file, type: "wake-run-start" });
}

function captured(
  woken: Woken,
  woke: Woke,
): Effect.Effect<number, { readonly message: string }, ChildProcessSpawner.ChildProcessSpawner> {
  return Effect.scoped(
    Effect.gen(function* runIntoOutputFile() {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const run = yield* commandOf(woken);
      const output = yield* woken.place.log.runOutput(woken.registration.agent);
      yield* startedRun(woken.place.log, woke)(output);
      const handle = yield* spawner.spawn(run);
      const draining = yield* Effect.forkScoped(Effect.ignore(Stream.runForEach(handle.all, output.write)));
      const exitCode = yield* handle.exitCode;
      yield* Effect.timeoutOption(Fiber.join(draining), DRAIN_AFTER_EXIT);
      return exitCode;
    }),
  );
}

function timeoutOf(registration: Registration): number {
  return registration.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES;
}

function wakeRun(
  woken: Woken,
): Effect.Effect<Option.Option<WakeRunFailure>, never, ChildProcessSpawner.ChildProcessSpawner> {
  const { items, place, registration } = woken;
  const woke = { agent: registration.agent, messages: Arr.map(items, ({ message }) => message.id) };
  const minutes = timeoutOf(registration);
  return captured(woken, woke).pipe(
    Effect.timeoutOption(Duration.minutes(minutes)),
    Effect.matchEffect({ onFailure: wakeFailed(woke, place.log), onSuccess: exited(woke, place.log, minutes) }),
  );
}

export { type RunPlace, runPlace, wakeRun };
