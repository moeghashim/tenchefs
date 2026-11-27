import { Array as Arr, Effect, Exit, Fiber } from "effect";
import type { CliResult, CommandLineNeeds } from "./command-line.ts";
import { cliResult, exitCodeOf, verbLayers } from "./command-line.ts";
import { exitCodeAfterFailure, runCookout } from "../../../cli/server.ts";
import { TestConsole } from "effect/testing";

interface InterruptedInvocation {
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly asked: Effect.Effect<void>;
}

const EXIT_SUCCESS = 0;

function linesText(lines: readonly unknown[]): string {
  return Arr.join(Arr.map(lines, String), "\n");
}

function interruptCookout({
  args,
  asked,
  env,
}: InterruptedInvocation): Effect.Effect<CliResult, never, CommandLineNeeds> {
  const program = Effect.gen(function* runThenInterrupt() {
    const running = yield* Effect.forkChild(runCookout(args, verbLayers));
    yield* asked;
    yield* Fiber.interrupt(running);
    const exit = yield* Fiber.await(running);
    if (Exit.isSuccess(exit)) {
      return EXIT_SUCCESS;
    }
    return exitCodeAfterFailure({ args, cause: exit.cause });
  });
  return Effect.gen(function* runCaptured() {
    const console = yield* TestConsole.make;
    const exitCode = yield* exitCodeOf({ console, env, program });
    const stdout = yield* console.logLines;
    const stderr = yield* console.errorLines;
    return cliResult({ exitCode, stderr: linesText(stderr), stdout: linesText(stdout) });
  });
}

export { interruptCookout };
