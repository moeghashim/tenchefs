import { Array as Arr, Effect, Option } from "effect";
import type { AgentSessionStateNeeds } from "./agent-session-state.ts";
import type { CallFailure } from "./adapters/sdk.ts";
import { Command } from "effect/cli";
import type { Spawner } from "./wake-queue.ts";
import { listenAll } from "./runner-registrations.ts";
import { refused } from "./output.ts";
import { registeredSessions } from "./registrations.ts";
import { runPlace } from "./wake-run.ts";

const noRegistrations: CallFailure = {
  code: "not_registered",
  message:
    "No agent is registered to wake. Inside a joined harness session run `cookout runner register -- <wake command…>`, " +
    "or join with `cookout join --as <name> --wake -- <wake command…>`.",
};

const runnerStopped: CallFailure = { code: "cli_error", message: "Every registered agent's live connection ended." };

const runAll: Effect.Effect<never, CallFailure, AgentSessionStateNeeds | Spawner> = Effect.scoped(
  Effect.gen(function* runRegistrations() {
    const registered = yield* registeredSessions;
    const place = yield* runPlace;
    if (!Arr.isReadonlyArrayNonEmpty(registered) || Option.isNone(place)) {
      return yield* Effect.fail(noRegistrations);
    }
    yield* Effect.forEach(
      registered,
      ({ registration }) => place.value.log.record(registration.agent, { type: "runner-start" }),
      {
        concurrency: 1,
        discard: true,
      },
    );
    yield* listenAll({ place: place.value, registered });
    return yield* Effect.fail(runnerStopped);
  }),
);

const startCommand = Command.make("start", {}, () =>
  Effect.matchEffect(runAll, { onFailure: refused, onSuccess: Effect.succeed }),
).pipe(
  Command.withDescription(
    "Run the runner in the foreground: one live connection per registration, as its agent, and on a mention a " +
      "wake run of its wake command, in the registered folder with the registered PATH, an inbox JSON of the " +
      "waiting mentions on stdin. On start, an agent's unread mentions go to one run. One agent's runs never " +
      "overlap: mentions heard during a run wait, with a stdout line each, and go to the next run together, less " +
      "any the agent acked meanwhile; a mention left unacked goes to one more run. It prints one stderr line once " +
      "every connection is open, and one stdout line as each run exits or is skipped. It never acks. A registration " +
      "made while it runs gets its own connection and catch-up, and a registration made again takes effect at that " +
      "agent's next run. When a " +
      "cookout watch for an agent replaces its connection, it stands down for that agent, dropping its waiting " +
      "mentions, until the agent is offline; then it reconnects and its unread mentions go to one run. When a " +
      "Claude Code agent's session is open, it writes the mentions into that session's inbox socket instead, as " +
      "one line of untrusted board data, and starts a wake run only if they aren't acked within 10 minutes.",
  ),
);

export { startCommand };
