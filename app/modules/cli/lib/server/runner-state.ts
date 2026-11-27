import type { AgentSessionStateFailure, AgentSessionStateFile, AgentSessionStateNeeds } from "./agent-session-state.ts";
import { Array as Arr, DateTime, Effect, Option, Order, Predicate, Ref, Schema } from "effect";
import { DROPPED_SUFFIX, RUNNER_SUFFIX, forgetRegistration, registeredSessions } from "./registrations.ts";
import { IsoTimeSchema, isoTimeOf } from "../../../time/server.ts";
import { lastRuns, runnerEvents } from "./runner-log.ts";
import type { CallFailure } from "./adapters/sdk.ts";
import type { InboundWarning } from "./claude-code-inbound.ts";
import type { LastRun } from "./runner-log.ts";
import type { RegisteredSession } from "./registrations.ts";
import { filesBeside } from "./agent-session-state.ts";
import { inboundWarning } from "./claude-code-inbound.ts";
import { isAlive } from "./claude-code-sessions.ts";

const PRETTY = 2;

type HeldState = "connected" | "connecting" | "running";
type LiveState = HeldState | "retrying";
type State = LiveState | "not-connected" | "not-running";

const LastErrorSchema = Schema.Struct({ code: Schema.String, message: Schema.String });

type LastError = typeof LastErrorSchema.Type;

const RunnerStateSchema = Schema.Struct({
  error: Schema.optionalKey(LastErrorSchema),
  pid: Schema.Int,
  state: Schema.Literals(["connected", "connecting", "retrying", "running"]),
});

type RunnerState = typeof RunnerStateSchema.Type;

interface KnownState {
  readonly error?: LastError;
  readonly state: State;
}

const DroppedSchema = Schema.Struct({
  agent: Schema.String,
  code: Schema.String,
  directory: Schema.String,
  droppedAt: IsoTimeSchema,
  message: Schema.String,
});

type Dropped = typeof DroppedSchema.Type;

interface RegistrationStatus {
  readonly agent: string;
  readonly directory: string;
  readonly error?: LastError;
  readonly lastRun?: LastRun;
  readonly liveDelivery?: InboundWarning;
  readonly state: State;
}

interface RunnerStatus {
  readonly dropped: readonly Dropped[];
  readonly registrations: readonly RegistrationStatus[];
}

const encodeRunnerState = Schema.encodeEffect(Schema.fromJsonString(RunnerStateSchema, { space: PRETTY }));
const encodeDropped = Schema.encodeEffect(Schema.fromJsonString(DroppedSchema, { space: PRETTY }));

function writeRunnerState(
  file: AgentSessionStateFile,
  state: Omit<RunnerState, "pid">,
): Effect.Effect<void, AgentSessionStateFailure> {
  return Effect.flatMap(Effect.orDie(encodeRunnerState({ ...state, pid: process.pid })), (text) =>
    file.beside(RUNNER_SUFFIX).write(text),
  );
}

interface Keeper {
  readonly reconnected: Effect.Effect<void>;
  readonly retrying: (failure: CallFailure) => Effect.Effect<void>;
  readonly set: (state: HeldState) => Effect.Effect<void>;
}

function keeperOf(file: AgentSessionStateFile): Effect.Effect<Keeper> {
  return Effect.gen(function* keepRunnerState() {
    const current = yield* Ref.make<LiveState>("connecting");
    function kept(state: Omit<RunnerState, "pid">): Effect.Effect<void> {
      return Effect.andThen(Ref.set(current, state.state), Effect.ignore(writeRunnerState(file, state)));
    }
    function unlessRunning(state: Omit<RunnerState, "pid">): Effect.Effect<void> {
      return Effect.flatMap(Ref.get(current), (now) =>
        Effect.asVoid(Effect.when(kept(state), Effect.succeed(now !== "running"))),
      );
    }
    return {
      reconnected: unlessRunning({ state: "connected" }),
      retrying: ({ code, message }) => unlessRunning({ error: { code, message }, state: "retrying" }),
      set: (state) => kept({ state }),
    };
  });
}

function forgetRunnerState(file: AgentSessionStateFile): Effect.Effect<void> {
  return Effect.ignore(file.beside(RUNNER_SUFFIX).remove);
}

interface Dropping {
  readonly failure: CallFailure;
  readonly registered: RegisteredSession;
}

function dropRegistration({ failure, registered }: Dropping): Effect.Effect<void, AgentSessionStateFailure> {
  const { file, registration } = registered;
  return Effect.gen(function* dropOne() {
    const now = yield* DateTime.now;
    const { agent, directory } = registration;
    const dropped = { agent, code: failure.code, directory, message: failure.message };
    const text = yield* Effect.orDie(encodeDropped({ ...dropped, droppedAt: isoTimeOf(now) }));
    yield* file.beside(DROPPED_SUFFIX).write(text);
    yield* forgetRegistration(file);
  });
}

const notRunning: KnownState = { state: "not-running" };

function stateOf(file: AgentSessionStateFile): Effect.Effect<KnownState, AgentSessionStateFailure> {
  return Effect.gen(function* readRunnerState() {
    const decoded = yield* Effect.orElseSucceed(file.beside(RUNNER_SUFFIX).read(RunnerStateSchema), Option.none);
    if (Option.isNone(decoded)) {
      return notRunning;
    }
    const alive = yield* isAlive(decoded.value.pid);
    if (!alive) {
      return notRunning;
    }
    const { pid: _pid, ...known } = decoded.value;
    return known;
  });
}

function statusOf(runs: ReadonlyMap<string, LastRun>) {
  return ({
    file,
    registration,
  }: RegisteredSession): Effect.Effect<RegistrationStatus, AgentSessionStateFailure, AgentSessionStateNeeds> =>
    Effect.gen(function* statusOfRegistration() {
      const known = yield* stateOf(file);
      const warning = yield* inboundWarning(registration);
      const status: RegistrationStatus = { agent: registration.agent, directory: registration.directory, ...known };
      const withRun = Option.match(Option.fromNullishOr(runs.get(registration.agent)), {
        onNone: (): RegistrationStatus => status,
        onSome: (lastRun) => ({ ...status, lastRun }),
      });
      return Option.match(warning, {
        onNone: () => withRun,
        onSome: (liveDelivery) => ({ ...withRun, liveDelivery }),
      });
    });
}

function isHeld({ state }: RegistrationStatus): boolean {
  return state !== "not-running";
}

function withRunnerRunning(registrations: readonly RegistrationStatus[]): readonly RegistrationStatus[] {
  if (!Arr.some(registrations, isHeld)) {
    return registrations;
  }
  return Arr.map(registrations, (status) => {
    if (isHeld(status)) {
      return status;
    }
    return { ...status, state: "not-connected" as const };
  });
}

const byAgent = Order.mapInput(Order.String, ({ agent }: { readonly agent: string }) => agent);

const runnerStatus: Effect.Effect<RunnerStatus, AgentSessionStateFailure, AgentSessionStateNeeds> = Effect.gen(
  function* readRunnerStatus() {
    const registered = yield* registeredSessions;
    const events = yield* runnerEvents;
    const runs = lastRuns(events);
    const statuses = yield* Effect.forEach(registered, statusOf(runs), { concurrency: 1 });
    const registrations = withRunnerRunning(statuses);
    const dropped = yield* filesBeside({ schema: DroppedSchema, suffix: DROPPED_SUFFIX });
    return {
      dropped: Arr.sort(
        Arr.map(dropped, ({ value }) => value),
        byAgent,
      ),
      registrations: Arr.sort(registrations, byAgent),
    };
  },
);

const stateText: Readonly<Record<State, string>> = {
  connected: "connected",
  connecting: "connecting",
  "not-connected": "not connected: the running runner holds no connection for it yet; cookout runner logs says why",
  "not-running": "not running: no runner is running",
  retrying: "retrying",
  running: "running a wake run",
};

function stateLine({ error, state }: KnownState): string {
  return Option.match(Option.fromNullishOr(error), {
    onNone: () => stateText[state],
    onSome: ({ code, message }) => `${stateText[state]} after ${code}: ${message}`,
  });
}

type Ending = NonNullable<LastRun["ended"]>;

function failedCode({ error, type }: Ending): string {
  return Option.match(Option.fromNullishOr(error), { onNone: () => type, onSome: ({ code }) => code });
}

function endingText(ended: Ending): string {
  if (Predicate.isNumber(ended.exitCode)) {
    return `exited ${String(ended.exitCode)}`;
  }
  if (Predicate.isNumber(ended.timedOutAfterMinutes)) {
    return `timed out after ${String(ended.timedOutAfterMinutes)} min`;
  }
  return `failed: ${failedCode(ended)}`;
}

function howItEnded({ ended }: LastRun): string {
  return Option.match(Option.fromNullishOr(ended), { onNone: () => "still running", onSome: endingText });
}

function lastRunText(lastRun: LastRun | undefined): string {
  return Option.match(Option.fromNullishOr(lastRun), {
    onNone: () => "",
    onSome: (run) => `  last wake run ${run.startedAt}: ${howItEnded(run)}, output in ${run.output}`,
  });
}

function warningLines(agent: string, warning: InboundWarning | undefined): readonly string[] {
  return Option.match(Option.fromNullishOr(warning), {
    onNone: Arr.empty,
    onSome: ({ crossSessionInbound, fix }) => [
      `  warning: ${agent}'s session would ${crossSessionInbound} runner messages (crossSessionInbound), so a ` +
        `mention waits for a wake run while it is open. Launch it with: ${fix}`,
    ],
  });
}

function registrationLines(status: RegistrationStatus): readonly string[] {
  const { agent, directory, lastRun, liveDelivery } = status;
  return [`${agent}  ${stateLine(status)}  ${directory}${lastRunText(lastRun)}`, ...warningLines(agent, liveDelivery)];
}

function statusLines({ dropped, registrations }: RunnerStatus): readonly string[] {
  const held = Arr.flatMap(registrations, registrationLines);
  const gone = Arr.map(
    dropped,
    ({ agent, code, directory, droppedAt }) => `${agent}  dropped: ${code} at ${droppedAt}  ${directory}`,
  );
  const lines = [...held, ...gone];
  if (!Arr.isReadonlyArrayNonEmpty(lines)) {
    return ["No agent is registered with the runner."];
  }
  return lines;
}

export { type Keeper, keeperOf, dropRegistration, forgetRunnerState, runnerStatus, statusLines };
