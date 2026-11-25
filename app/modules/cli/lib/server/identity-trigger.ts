import { Argument, Command, Flag } from "effect/cli";
import { Effect, Option, Stdio, String as Str, Stream } from "effect";
import { answer, answered } from "./output.ts";
import { callServer, toFailure } from "./adapters/sdk.ts";
import type { CallFailure } from "./adapters/sdk.ts";
import type { TriggerHeader } from "../../../sdk/index.ts";

const agentName = Argument.String("agent").pipe(Argument.withDescription("The agent's name."));

const noToken: CallFailure = {
  code: "usage",
  message:
    "Give the trigger URL's token on stdin, such as `cookout identity trigger set triage https://… < token.txt`, never on the command line.",
};

const tokenOnStdin: Effect.Effect<string, CallFailure, Stdio.Stdio> = Effect.flatMap(Stdio.Stdio, (stdio) =>
  stdio.stdin.pipe(
    Stream.decodeText,
    Stream.mkString,
    Effect.mapBoth({ onFailure: toFailure, onSuccess: Str.trim }),
    Effect.filterOrFail(Str.isNonEmpty, () => noToken),
  ),
);

const NONE = 0;
const PAST_COLON = 1;

const headerFlag = Flag.String("header").pipe(
  Flag.atLeast(NONE),
  Flag.withDescription(
    "An extra header each call sends, as `name: value`, such as `anthropic-version: 2023-06-01`. Repeat it for more. Its value is never shown again, but a secret on the command line lands in shell history.",
  ),
);

const badHeader: CallFailure = {
  code: "usage",
  message: "Give each --header as `name: value`, such as `--header 'anthropic-version: 2023-06-01'`.",
};

function headerOf(given: string): Effect.Effect<TriggerHeader, CallFailure> {
  const colon = Option.filter(Str.indexOf(":")(given), (at) => at > NONE);
  return Effect.mapBoth(Effect.fromOption(colon), {
    onFailure: () => badHeader,
    onSuccess: (at) => ({
      name: Str.trim(Str.slice(NONE, at)(given)),
      value: Str.trim(Str.slice(at + PAST_COLON)(given)),
    }),
  });
}

function headersOf(given: readonly string[]): Effect.Effect<readonly TriggerHeader[], CallFailure> {
  return Effect.forEach(given, headerOf, { concurrency: 1 });
}

function headersAndToken(
  given: readonly string[],
): Effect.Effect<readonly [readonly TriggerHeader[], string], CallFailure, Stdio.Stdio> {
  return Effect.all([headersOf(given), tokenOnStdin], { concurrency: 1 });
}

const triggerSetCommand = Command.make(
  "set",
  {
    agent: agentName,
    header: headerFlag,
    url: Argument.String("url").pipe(
      Argument.withDescription("The https URL a mention of the agent POSTs to, such as a routine's trigger URL."),
    ),
  },
  ({ agent, header, url }) =>
    answered(
      Effect.flatMap(headersAndToken(header), ([headers, token]) =>
        callServer((client) => client.setTrigger(agent, { headers, token, url })),
      ),
    ),
).pipe(
  Command.withDescription(
    "Set or replace your agent's trigger URL and its extra headers, reading its token from stdin. Each mention of the agent POSTs { text } to the URL with the token as a bearer and each --header.",
  ),
);

const triggerClearCommand = Command.make("clear", { agent: agentName }, ({ agent }) =>
  answer((client) => client.clearTrigger(agent)),
).pipe(Command.withDescription("Clear your agent's trigger URL and token, so a mention calls nothing."));

const triggerGetCommand = Command.make("get", { agent: agentName }, ({ agent }) =>
  answer((client) => client.getTrigger(agent)),
).pipe(
  Command.withDescription(
    "Show your agent's trigger URL, its extra headers' names and how its last call went, never its token or a header's value.",
  ),
);

const identityTriggerCommand = Command.make("trigger").pipe(
  Command.withDescription("Set, clear or show the trigger URL your agent's mentions call."),
  Command.withSubcommands([triggerSetCommand, triggerClearCommand, triggerGetCommand]),
);

export { identityTriggerCommand };
