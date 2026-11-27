import { Array as Arr, Deferred, Effect, Fiber, Option } from "effect";
import { printErrorLine, refused } from "./output.ts";
import type { AgentSessionStateNeeds } from "./agent-session-state.ts";
import type { CallFailure } from "./adapters/sdk.ts";
import { Command } from "effect/cli";
import type { Listening } from "./runner-agent.ts";
import type { RegisteredSession } from "./registrations.ts";
import type { RunPlace } from "./wake-run.ts";
import type { Scope } from "effect";
import type { Spawner } from "./wake-queue.ts";
import { registeredSessions } from "./registrations.ts";
import { runPlace } from "./wake-run.ts";
import { wakeAgent } from "./runner-agent.ts";

const noRegistrations: CallFailure = {
  code: "not_registered",
  message:
    "No agent is registered to wake. Inside a joined harness session run `cookout runner register -- <wake command…>`, " +
    "or join with `cookout join --as <name> --wake -- <wake command…>`.",
};

const runnerStopped: CallFailure = { code: "cli_error", message: "Every registered agent's live connection ended." };

interface Opening {
  readonly listening: Listening;
  readonly open: Effect.Effect<boolean>;
}

function openingFor(place: RunPlace) {
  return (registered: RegisteredSession): Effect.Effect<Opening> =>
    Effect.gen(function* openingOfAgent() {
      const done = yield* Deferred.make<boolean>();
      return { listening: { connected: Deferred.succeed(done, true), place, registered }, open: Deferred.await(done) };
    });
}

function listenAll(
  registered: Arr.NonEmptyReadonlyArray<RegisteredSession>,
  place: RunPlace,
): Effect.Effect<void, never, Scope.Scope | Spawner> {
  return Effect.gen(function* listenToEveryAgent() {
    const openings = yield* Effect.forEach(registered, openingFor(place), { concurrency: 1 });
    const running = yield* Effect.forkScoped(
      Effect.forEach(openings, ({ listening }) => wakeAgent(listening), { concurrency: "unbounded", discard: true }),
    );
    yield* Effect.forEach(openings, ({ open }) => open, { concurrency: "unbounded", discard: true });
    yield* printErrorLine({ waking: Arr.map(registered, ({ registration }) => registration.agent) });
    yield* Fiber.join(running);
  });
}

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
    yield* listenAll(registered, place.value);
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
      "every connection is open, and one stdout line as each run exits or is skipped. It never acks. When a " +
      "cookout watch for an agent replaces its connection, it stands down for that agent, dropping its waiting " +
      "mentions, until the agent is offline; then it reconnects and its unread mentions go to one run.",
  ),
);

export { startCommand };
