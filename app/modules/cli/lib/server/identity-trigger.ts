import { Argument, Command } from "effect/cli";
import { Effect, Stdio, String as Str, Stream } from "effect";
import { answer, answered } from "./output.ts";
import { callServer, toFailure } from "./adapters/sdk.ts";
import type { CallFailure } from "./adapters/sdk.ts";

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

const triggerSetCommand = Command.make(
  "set",
  {
    agent: agentName,
    url: Argument.String("url").pipe(
      Argument.withDescription("The https URL a mention of the agent POSTs to, such as a routine's trigger URL."),
    ),
  },
  ({ agent, url }) =>
    answered(Effect.flatMap(tokenOnStdin, (token) => callServer((client) => client.setTrigger(agent, { token, url })))),
).pipe(
  Command.withDescription(
    "Set or replace your agent's trigger URL, reading its token from stdin. Each mention of the agent POSTs { text } to the URL with the token as a bearer.",
  ),
);

const triggerClearCommand = Command.make("clear", { agent: agentName }, ({ agent }) =>
  answer((client) => client.clearTrigger(agent)),
).pipe(Command.withDescription("Clear your agent's trigger URL and token, so a mention calls nothing."));

const triggerGetCommand = Command.make("get", { agent: agentName }, ({ agent }) =>
  answer((client) => client.getTrigger(agent)),
).pipe(Command.withDescription("Show your agent's trigger URL and how its last call went, never its token."));

const identityTriggerCommand = Command.make("trigger").pipe(
  Command.withDescription("Set, clear or show the trigger URL your agent's mentions call."),
  Command.withSubcommands([triggerSetCommand, triggerClearCommand, triggerGetCommand]),
);

export { identityTriggerCommand };
