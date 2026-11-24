import { Array as Arr, Cause, Effect, Option } from "effect";
import { exitCodeFor, printErrorLine } from "./output.ts";

const STOPPED_BY_A_SIGNAL: ReadonlySet<string> = new Set(["serve", "watch"]);
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

const interrupted = {
  error: {
    code: "interrupted",
    message: "Stopped by a signal before it finished. Check whether it took effect before running it again.",
  },
};

function stopsByASignal(args: readonly string[]): boolean {
  return Option.exists(Arr.head(args), (verb) => STOPPED_BY_A_SIGNAL.has(verb));
}

function interruptedExitCode(args: readonly string[]): number {
  if (stopsByASignal(args)) {
    return EXIT_SUCCESS;
  }
  return EXIT_FAILURE;
}

interface Failed {
  readonly args: readonly string[];
  readonly cause: Cause.Cause<unknown>;
}

function exitCodeAfterFailure({ args, cause }: Failed): number {
  if (Cause.hasInterruptsOnly(cause)) {
    return interruptedExitCode(args);
  }
  return exitCodeFor(Cause.squash(cause));
}

function sayInterrupted(args: readonly string[]): Effect.Effect<void> {
  if (stopsByASignal(args)) {
    return Effect.void;
  }
  return printErrorLine(interrupted);
}

export { exitCodeAfterFailure, sayInterrupted };
