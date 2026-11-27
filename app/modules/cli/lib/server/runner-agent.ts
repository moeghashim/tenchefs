import type { CallFailure, ClientWithAgentSessionState } from "./adapters/sdk.ts";
import type { During, Spawner, WakeQueue } from "./wake-queue.ts";
import { Effect, Function, Option } from "effect";
import { REGISTRATION_SUFFIX, latestRegistration, opened } from "./registrations.ts";
import { dropRegistration, forgetRunnerState, keeperOf } from "./runner-state.ts";
import type { Keeper } from "./runner-state.ts";
import type { RegisteredSession } from "./registrations.ts";
import type { RunPlace } from "./wake-run.ts";
import { callClient } from "./adapters/sdk.ts";
import { heedMentions } from "./runner-listening.ts";
import { notJoined } from "./adapters/call-failure.ts";
import { printErrorLine } from "./output.ts";
import { saidFailed } from "./wake-run-failure.ts";
import { wakeQueue } from "./wake-queue.ts";

interface Listening {
  readonly connected: Effect.Effect<boolean>;
  readonly place: RunPlace;
  readonly registered: RegisteredSession;
}

interface Heeding {
  readonly asAgent: ClientWithAgentSessionState;
  readonly keeper: Keeper;
  readonly queue: WakeQueue;
}

const endedSessionCodes: ReadonlySet<string> = new Set([
  "agent_session_expired",
  "agent_session_revoked",
  notJoined.code,
]);

function presenceDuring(asAgent: ClientWithAgentSessionState, keeper: Keeper): During {
  const connected = keeper.set("connected");
  return {
    ended: Effect.andThen(Effect.ignore(callClient((client) => client.endWakeRun())(asAgent)), connected),
    failed: (failure, given) => Effect.andThen(saidFailed({ asAgent, failure, given }), connected),
    started: Effect.andThen(
      keeper.set("running"),
      Effect.ignore(callClient((client) => client.startWakeRun())(asAgent)),
    ),
  };
}

function listen(listening: Listening, { asAgent, keeper, queue }: Heeding): Effect.Effect<void, CallFailure> {
  return heedMentions({
    agent: listening.registered.registration.agent,
    asAgent,
    connected: Effect.andThen(keeper.reconnected, listening.connected),
    queue,
    record: (event) => listening.place.log.record(listening.registered.registration.agent, event),
    replaced: keeper.set("connecting"),
    retrying: keeper.retrying,
  });
}

function wakeUntilUnregistered(listening: Listening): Effect.Effect<void, CallFailure, Spawner> {
  const { file, registration } = listening.registered;
  return Effect.scoped(
    Effect.gen(function* listenAndWake() {
      const keeper = yield* keeperOf(file);
      yield* keeper.set("connecting");
      const asAgent = yield* opened(listening.registered);
      const queue = yield* wakeQueue({
        asAgent,
        during: presenceDuring(asAgent, keeper),
        latest: latestRegistration(listening.registered),
        place: listening.place,
        registration,
      });
      const heard = listen(listening, { asAgent, keeper, queue });
      const ended = yield* Effect.exit(Effect.raceFirst(heard, file.beside(REGISTRATION_SUFFIX).untilGone));
      yield* queue.stop;
      yield* forgetRunnerState(file);
      yield* ended;
      yield* Effect.andThen(
        listening.place.log.record(registration.agent, { type: "unregister" }),
        printErrorLine({ agent: registration.agent, unregistered: true }),
      );
    }),
  );
}

function dropIfEnded(registered: RegisteredSession, failure: CallFailure): Effect.Effect<boolean> {
  const { exists } = registered.file.beside(REGISTRATION_SUFFIX);
  const drop = Effect.ignore(dropRegistration({ failure, registered }));
  const dropWhileRegistered = Effect.when(drop, Effect.orElseSucceed(exists, Function.constFalse));
  const ended = Effect.succeed(endedSessionCodes.has(failure.code));
  return Effect.map(Effect.when(dropWhileRegistered, ended), (dropped) => Option.isSome(Option.flatten(dropped)));
}

function onStop({ connected, place, registered }: Listening) {
  return (failure: CallFailure): Effect.Effect<void> =>
    Effect.gen(function* stopListening() {
      yield* forgetRunnerState(registered.file);
      const dropped = yield* dropIfEnded(registered, failure);
      const error = { code: failure.code, message: failure.message };
      yield* place.log.record(registered.registration.agent, { dropped, error, type: "refusal" });
      yield* printErrorLine({ agent: registered.registration.agent, dropped, error });
      yield* connected;
    });
}

function wakeAgent(listening: Listening): Effect.Effect<void, never, Spawner> {
  return Effect.matchEffect(wakeUntilUnregistered(listening), {
    onFailure: onStop(listening),
    onSuccess: Effect.succeed,
  });
}

export { type Listening, wakeAgent };
