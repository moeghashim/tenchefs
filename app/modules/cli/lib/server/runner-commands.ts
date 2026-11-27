import { Argument, Command, Flag } from "effect/cli";
import { Array as Arr, Console, Effect, Option } from "effect";
import { SESSION_ID_PLACEHOLDER, TIMEOUT_DESCRIPTION, registerHere, unregister } from "./registrations.ts";
import { answered, printAnswer, printLine, refused } from "./output.ts";
import { runnerStatus, statusLines } from "./runner-state.ts";
import { runnerEvents } from "./runner-log.ts";

const wakeCommandArgument = Argument.String("wake-command").pipe(
  Argument.variadic(),
  Argument.withDescription(
    `The wake command's argv, after --, run with no shell. ${SESSION_ID_PLACEHOLDER} becomes this harness session's ID.`,
  ),
);

const timeoutFlag = Flag.Int("timeout").pipe(Flag.optional, Flag.withDescription(TIMEOUT_DESCRIPTION));

const registerCommand = Command.make(
  "register",
  { timeout: timeoutFlag, wake: wakeCommandArgument },
  ({ timeout, wake }) => answered(registerHere({ timeoutMinutes: timeout, words: wake })),
).pipe(
  Command.withDescription(
    "Register this joined harness session with the runner: cookout runner register [--timeout <minutes>] -- " +
      "<wake command…>. Keeps the agent, the board, this folder, PATH, the timeout if given and the wake command " +
      `(with ${SESSION_ID_PLACEHOLDER} filled in) in a ` +
      "mode-600 file beside the session's agent session state. Refused with not_joined before join.",
  ),
);

const agentArgument = Argument.String("agent").pipe(
  Argument.withDescription("The registered agent, as `cookout runner status` names it."),
);

const unregisterCommand = Command.make("unregister", { agent: agentArgument }, ({ agent }) =>
  answered(unregister(agent)),
).pipe(
  Command.withDescription(
    "Delete the agent's registration: a running runner closes that agent's live connection and starts no more " +
      "wake runs for it, and a run in progress finishes. `cookout leave` does the same for its own session. " +
      "Refused with not_registered when no registration names the agent.",
  ),
);

const jsonFlag = Flag.Boolean("json").pipe(Flag.withDefault(false), Flag.withDescription("Print the status as JSON."));

function printStatus(json: boolean) {
  return (status: Effect.Success<typeof runnerStatus>): Effect.Effect<void> => {
    if (json) {
      return printAnswer(status);
    }
    return Effect.forEach(statusLines(status), (line) => Console.log(line), { concurrency: 1, discard: true });
  };
}

const statusCommand = Command.make("status", { json: jsonFlag }, ({ json }) =>
  Effect.matchEffect(runnerStatus, { onFailure: refused, onSuccess: printStatus(json) }),
).pipe(
  Command.withDescription(
    "List each registration: its agent, its folder, and whether the runner is connecting, connected or running a " +
      "wake run for it, or no runner is running, and its last wake run: when it started, how it ended and its " +
      "output file; then each dropped registration, with the refusal that dropped it " +
      "and when. --json prints the same as JSON. It prints no token.",
  ),
);

const logsAgentArgument = Argument.String("agent").pipe(
  Argument.optional,
  Argument.withDescription("Only this agent's events."),
);

const logsCommand = Command.make("logs", { agent: logsAgentArgument }, ({ agent }) =>
  Effect.gen(function* printRunnerEvents() {
    const events = yield* runnerEvents;
    const shown = Arr.filter(events, (event) =>
      Option.match(agent, { onNone: () => true, onSome: (name) => event.agent === name }),
    );
    yield* Effect.forEach(shown, printLine, { concurrency: 1, discard: true });
  }),
).pipe(
  Command.withDescription(
    "Print the runner's event log, one JSON line per event, oldest first: runner-start, connect, mention, " +
      "wake-run-start (naming the run's output file), exit, timeout, wake-failed, skip, stand-down, unregister " +
      "and refusal, each with the agent and the time. Give an agent to print only its events. It holds message " +
      "IDs, never a mention's text or a token. Each wake run's stdout and stderr are in its own file under runs/ " +
      "in the state folder; an agent's oldest files are deleted once its files pass 1 MiB.",
  ),
);

export { logsCommand, registerCommand, statusCommand, unregisterCommand };
