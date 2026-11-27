import { Array as Arr, Deferred, Effect, Fiber, Path, Queue, Schema } from "effect";
import type { Console, Scope } from "effect";
import { exitCodeAfter, exitCodeOf, verbLayers } from "./command-line.ts";
import type { CommandLineNeeds } from "./command-line.ts";
import { TestConsole } from "effect/testing";
import { parseLine } from "./cli.ts";
import { runCookout as runCommandLine } from "../../../cli/server.ts";

interface FakeWakeSettings {
  readonly ack?: boolean;
  readonly childPidFile?: string;
  readonly exitCode?: number;
  readonly hang?: boolean;
  readonly log: string;
  readonly print?: string;
  readonly printRepeat?: number;
  readonly succeedAfter?: string;
  readonly reply?: string;
  readonly sdkReply?: string;
  readonly tokenFile?: string;
  readonly touch?: string;
  readonly waitFor?: string;
}

interface StartedRunner {
  readonly firstStderr: unknown;
  readonly stdoutNow: Effect.Effect<readonly unknown[]>;
  readonly stdoutLines: (count: number) => Effect.Effect<readonly unknown[]>;
  readonly stderrLines: (count: number) => Effect.Effect<readonly unknown[]>;
  readonly stop: Effect.Effect<void>;
}

const FAKE = new URL("fake-wake-command.ts", import.meta.url);
const SESSION_ID_PLACEHOLDER = "{session-id}";
const FIRST = 0;
const runnerStart = exitCodeAfter(runCommandLine(["runner", "start"], verbLayers));
const encodeSettings = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

function fakeWakeCommand(settings: FakeWakeSettings): Effect.Effect<readonly string[], never, Path.Path> {
  return Effect.gen(function* makeFakeWakeCommand() {
    const path = yield* Path.Path;
    const fake = yield* Effect.orDie(path.fromFileUrl(FAKE));
    const text = yield* Effect.orDie(encodeSettings(settings));
    return [process.execPath, fake, SESSION_ID_PLACEHOLDER, text];
  });
}

function lineOf(line: readonly unknown[]): unknown {
  return parseLine(Arr.join(Arr.map(line, String), " "));
}

function waitingOn(printed: Effect.Effect<unknown>) {
  return (lines: readonly unknown[]) =>
    function linesUntil(count: number): Effect.Effect<readonly unknown[]> {
      if (lines.length >= count) {
        return Effect.sync(() => [...lines]);
      }
      return Effect.andThen(printed, () => linesUntil(count));
    };
}

function startRunner(
  env: Readonly<Record<string, string>>,
): Effect.Effect<StartedRunner, never, CommandLineNeeds | Scope.Scope> {
  return Effect.gen(function* startRunnerInProcess() {
    const output = yield* TestConsole.make;
    const first = yield* Deferred.make<unknown>();
    const printed = yield* Queue.unbounded<number>();
    const logged: unknown[] = [];
    const errored: unknown[] = [];
    const console: Console.Console = {
      ...output,
      error: (...line: readonly unknown[]): void => {
        output.error(...line);
        Queue.offerUnsafe(printed, errored.push(lineOf(line)));
        Deferred.doneUnsafe(first, Effect.succeed(errored[FIRST]));
      },
      log: (...line: readonly unknown[]): void => {
        output.log(...line);
        Queue.offerUnsafe(printed, logged.push(lineOf(line)));
      },
    };
    const running = yield* Effect.forkScoped(exitCodeOf({ console, env, program: runnerStart }));
    const firstStderr = yield* Deferred.await(first);
    const until = waitingOn(Queue.take(printed));
    return {
      firstStderr,
      stderrLines: until(errored),
      stdoutLines: until(logged),
      stdoutNow: Effect.sync(() => [...logged]),
      stop: Fiber.interrupt(running),
    };
  });
}

export { type FakeWakeSettings, type StartedRunner, fakeWakeCommand, startRunner };
