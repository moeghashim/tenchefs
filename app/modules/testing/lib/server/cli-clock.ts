import { Array as Arr, Deferred, Duration, Effect, Fiber } from "effect";
import type { CliResult, CommandLineNeeds } from "./command-line.ts";
import type { Console, Scope } from "effect";
import { TestClock, TestConsole } from "effect/testing";
import { cliResult, exitCodeAfter, exitCodeOf, verbLayers } from "./command-line.ts";
import { runCookout as runCommandLine } from "../../../cli/server.ts";

interface RunWhile<During, DuringNeeds> {
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly tickSeconds: number;
  readonly whileRunning: (firstError: string) => Effect.Effect<During, never, DuringNeeds>;
}

interface RanWhile<During> extends CliResult {
  readonly during: During;
}

interface ErrorSignal {
  readonly console: Console.Console;
  readonly firstError: Effect.Effect<string>;
  readonly output: TestConsole.TestConsole;
}

const PAUSE_MILLIS = 5;
const pause = Duration.millis(PAUSE_MILLIS);

function lineOf(parts: readonly unknown[]): string {
  return Arr.join(Arr.map(parts, String), " ");
}

function textOf(lines: readonly unknown[]): string {
  return Arr.join(Arr.map(lines, String), "\n");
}

const errorSignal: Effect.Effect<ErrorSignal> = Effect.gen(function* makeErrorSignal() {
  const output = yield* TestConsole.make;
  const first = yield* Deferred.make<string>();
  const console: Console.Console = {
    ...output,
    error: (...parts: readonly unknown[]): void => {
      output.error(...parts);
      Deferred.doneUnsafe(first, Effect.succeed(lineOf(parts)));
    },
  };
  return { console, firstError: Deferred.await(first), output };
});

function runCookoutWhile<During, DuringNeeds>(
  run: RunWhile<During, DuringNeeds>,
): Effect.Effect<RanWhile<During>, never, CommandLineNeeds | DuringNeeds | Scope.Scope> {
  return Effect.gen(function* runWhile() {
    const { console, firstError, output } = yield* errorSignal;
    const program = exitCodeAfter(runCommandLine(run.args, verbLayers));
    const command = yield* Effect.forkScoped(exitCodeOf({ console, env: run.env, program }));
    const during = yield* Effect.flatMap(firstError, run.whileRunning);
    const moveClock = Effect.andThen(
      TestClock.adjust(Duration.seconds(run.tickSeconds)),
      TestClock.withLive(Effect.sleep(pause)),
    );
    const exitCode = yield* Effect.raceFirst(Fiber.join(command), Effect.forever(moveClock));
    const stdout = yield* output.logLines;
    const stderr = yield* output.errorLines;
    return { ...cliResult({ exitCode, stderr: textOf(stderr), stdout: textOf(stdout) }), during };
  });
}

export { runCookoutWhile };
