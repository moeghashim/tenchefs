import { Array as Arr, Deferred, Effect, FileSystem, Function, Path, Ref, Stream } from "effect";
import { REGISTRATION_SUFFIX, registeredSessions } from "./registrations.ts";
import type { RegisteredSession, Registration } from "./registrations.ts";
import { AGENT_SESSIONS } from "./state-folder.ts";
import type { AgentSessionStateNeeds } from "./agent-session-state.ts";
import type { Listening } from "./runner-agent.ts";
import type { RunPlace } from "./wake-run.ts";
import type { Scope } from "effect";
import type { Spawner } from "./wake-queue.ts";
import { folderChanges } from "./file-beside.ts";
import { printErrorLine } from "./output.ts";
import { wakeAgent } from "./runner-agent.ts";

type Needs = AgentSessionStateNeeds | Scope.Scope | Spawner;

interface Held {
  readonly live: boolean;
  readonly registration: Registration;
}

type HeldByKey = ReadonlyMap<string, Held>;

interface Holding {
  readonly allEnded: Effect.Effect<boolean>;
  readonly ended: (registered: RegisteredSession, stillRegistered: boolean) => Effect.Effect<void>;
  readonly held: Effect.Effect<HeldByKey>;
  readonly hold: (registration: Registration) => Effect.Effect<void>;
  readonly place: RunPlace;
}

function keyOf({ harness, sessionId, url }: Registration): string {
  return Arr.join([harness, String(sessionId), url], "\n");
}

function withHeld(key: string, held: readonly Held[]): (holding: HeldByKey) => HeldByKey {
  return (holding) => {
    const others = Arr.filter([...holding], ([found]: readonly [string, Held]) => found !== key);
    const kept = Arr.map(held, (value) => [key, value] as const);
    return new Map([...others, ...kept]);
  };
}

function noneLive(holding: HeldByKey): boolean {
  return !Arr.some([...holding.values()], ({ live }) => live);
}

function holdingOf(place: RunPlace): Effect.Effect<Holding> {
  return Effect.gen(function* keepHolding() {
    const allEnded = yield* Deferred.make<boolean>();
    const held = yield* Ref.make<HeldByKey>(new Map());
    function ended({ registration }: RegisteredSession, stillRegistered: boolean): Effect.Effect<void> {
      const kept = Arr.filter([{ live: false, registration }], () => stillRegistered);
      const left = Ref.updateAndGet(held, withHeld(keyOf(registration), kept));
      return Effect.asVoid(Effect.when(Deferred.succeed(allEnded, true), Effect.map(left, noneLive)));
    }
    return {
      allEnded: Deferred.await(allEnded),
      ended,
      held: Ref.get(held),
      hold: (registration) => {
        const live = [{ live: true, registration }];
        return Ref.update(held, withHeld(keyOf(registration), live));
      },
      place,
    };
  });
}

function isNew(held: HeldByKey) {
  return ({ registration }: RegisteredSession): boolean => !held.has(keyOf(registration));
}

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

function afterWaking(holding: Holding, registered: RegisteredSession): Effect.Effect<void> {
  const { exists } = registered.file.beside(REGISTRATION_SUFFIX);
  return Effect.flatMap(Effect.orElseSucceed(exists, Function.constFalse), (stillRegistered) =>
    holding.ended(registered, stillRegistered),
  );
}

function startWaking(holding: Holding) {
  return (registered: RegisteredSession): Effect.Effect<Opening, never, Scope.Scope | Spawner> =>
    Effect.gen(function* holdAndWake() {
      yield* holding.hold(registered.registration);
      const opening = yield* openingFor(holding.place)(registered);
      yield* Effect.forkScoped(Effect.andThen(wakeAgent(opening.listening), afterWaking(holding, registered)));
      return opening;
    });
}

function wakeNew(holding: Holding) {
  return (found: RegisteredSession): Effect.Effect<void, never, Scope.Scope | Spawner> =>
    Effect.gen(function* wakeNewRegistration() {
      const { open } = yield* startWaking(holding)(found);
      const said = printErrorLine({ waking: [found.registration.agent] });
      yield* Effect.forkScoped(Effect.andThen(open, said));
    });
}

function pickUpNew(holding: Holding): Effect.Effect<void, never, Needs> {
  return Effect.gen(function* startNewRegistrations() {
    const registered = yield* Effect.orElseSucceed(registeredSessions, Arr.empty);
    const held = yield* holding.held;
    const fresh = Arr.filter(registered, isNew(held));
    yield* Effect.forEach(fresh, wakeNew(holding), { concurrency: 1, discard: true });
  });
}

function watchRegistrations(holding: Holding): Effect.Effect<void, never, Needs> {
  return Effect.gen(function* watchStateFolder() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const folder = path.join(holding.place.stateFolder, AGENT_SESSIONS);
    yield* Stream.runForEach(folderChanges({ folder, fs }), () => pickUpNew(holding));
  });
}

interface Waking {
  readonly place: RunPlace;
  readonly registered: Arr.NonEmptyReadonlyArray<RegisteredSession>;
}

function listenAll({ place, registered }: Waking): Effect.Effect<void, never, Needs> {
  return Effect.gen(function* listenToEveryAgent() {
    const holding = yield* holdingOf(place);
    const openings = yield* Effect.forEach(registered, startWaking(holding), { concurrency: 1 });
    yield* Effect.forEach(openings, ({ open }) => open, { concurrency: "unbounded", discard: true });
    yield* printErrorLine({ waking: Arr.map(registered, ({ registration }) => registration.agent) });
    yield* Effect.raceFirst(holding.allEnded, watchRegistrations(holding));
  });
}

export { listenAll };
