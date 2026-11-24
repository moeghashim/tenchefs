import type { Call, CallFailure } from "./adapters/sdk.ts";
import { Console, Effect, Predicate, Schema } from "effect";
import type { AgentSessionStateNeeds } from "./agent-session-state.ts";
import { CliOutput } from "effect/cli";
import { callServer } from "./adapters/sdk.ts";

class CommandFailed extends Schema.TaggedError<CommandFailed>()("CommandFailed", {
  code: Schema.String,
  exitCode: Schema.optional(Schema.Int),
}) {}

const EXIT_FAILURE = 1;

const isCommandFailed = Schema.is(CommandFailed);

function exitCodeFor(failure: unknown): number {
  if (isCommandFailed(failure) && Predicate.isNumber(failure.exitCode)) {
    return failure.exitCode;
  }
  return EXIT_FAILURE;
}

const PRETTY = 2;
const toLine = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
const toPretty = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown, { space: PRETTY }));

function printLine(line: Readonly<Record<string, unknown>>): Effect.Effect<void> {
  return toLine(line).pipe(Effect.orDie, Effect.flatMap(Console.log));
}

function printErrorLine(line: Readonly<Record<string, unknown>>): Effect.Effect<void> {
  return toLine(line).pipe(Effect.orDie, Effect.flatMap(Console.error));
}

function printError(code: string, message: string): Effect.Effect<void> {
  return toLine({ error: { code, message } }).pipe(Effect.orDie, Effect.flatMap(Console.error));
}

function printWarning(warning: string): Effect.Effect<void> {
  return toLine({ warning }).pipe(Effect.orDie, Effect.flatMap(Console.error));
}

function presentInvalid(event: CliOutput.Presenter.InvalidInvocation): Effect.Effect<void> {
  return Effect.gen(function* presentUsage() {
    const formatter = yield* CliOutput.Formatter;
    const errors = formatter.formatErrors(event.errors);
    const help = formatter.formatHelpDoc(event.helpDoc);
    yield* printError("usage", `${errors}\n\n${help}`);
  });
}

const jsonPresenter: CliOutput.Presenter = {
  present: (event) => {
    if (event._tag === "InvalidInvocation") {
      return presentInvalid(event);
    }
    return CliOutput.defaultPresenter.present(event);
  },
};

function withJsonPresenter<Value, Failure, Needs>(
  effect: Effect.Effect<Value, Failure, Needs>,
): Effect.Effect<Value, Failure, Needs> {
  return Effect.provideService(effect, CliOutput.Presenter, jsonPresenter);
}

const usageFailed = Effect.fail(CommandFailed.make({ code: "usage" }));

function printAnswer(value: unknown): Effect.Effect<void> {
  return toPretty(value).pipe(Effect.orDie, Effect.flatMap(Console.log));
}

function refused(error: { readonly code: string }): Effect.Effect<never, CommandFailed> {
  return toLine({ error }).pipe(
    Effect.orDie,
    Effect.flatMap(Console.error),
    Effect.andThen(Effect.fail(CommandFailed.make({ code: error.code }))),
  );
}

function answered<Value, Needs = AgentSessionStateNeeds>(
  effect: Effect.Effect<Value, CallFailure, Needs>,
): Effect.Effect<void, CommandFailed, Needs> {
  return Effect.matchEffect(effect, { onFailure: refused, onSuccess: printAnswer });
}

function answer<Value>(call: Call<Value>): Effect.Effect<void, CommandFailed, AgentSessionStateNeeds> {
  return answered(callServer(call));
}

export {
  CommandFailed,
  answer,
  answered,
  exitCodeFor,
  printAnswer,
  printErrorLine,
  printLine,
  printWarning,
  refused,
  usageFailed,
  withJsonPresenter,
};
