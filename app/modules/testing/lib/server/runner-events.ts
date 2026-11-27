import { Array as Arr, Effect, FileSystem, Option, Path, Record, Schedule, Schema, String as Str } from "effect";
import type { BoardAgent, WakeBoard } from "./wake-board.ts";
import type { CommandLineNeeds } from "./command-line.ts";
import type { FakeWakeSettings } from "./runner.ts";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import type { TestCookout } from "./cookout.ts";
import { joinWaking } from "./wake-agents.ts";
import { parseLine } from "./cli.ts";
import { runCookout } from "./command-line.ts";
import { startRunner } from "./runner.ts";
import { wakeBoard } from "./wake-board.ts";

type Needs = CommandLineNeeds | TestCookout | Scope.Scope;

const RunnerEventSchema = Schema.Struct({
  agent: Schema.String,
  at: Schema.String,
  messages: Schema.optionalKey(Schema.Array(Schema.Int)),
  output: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
  type: Schema.String,
});

type RunnerEvent = typeof RunnerEventSchema.Type;

interface EventKind {
  readonly agent: string;
  readonly type: string;
}

interface AgentEvents {
  readonly agent: string;
  readonly on: WakeBoard;
}

interface Awaited extends EventKind {
  readonly count?: number;
  readonly on: WakeBoard;
}

interface Joined {
  readonly name: string;
  readonly waking: WakingAgents;
}

interface WakingAgent {
  readonly command?: readonly string[];
  readonly name: string;
  readonly settings?: Omit<FakeWakeSettings, "log">;
  readonly timeoutMinutes?: number;
  readonly waits?: boolean;
}

interface WakingAgents {
  readonly joined: Readonly<Record<string, BoardAgent>>;
  readonly on: WakeBoard;
  readonly release: Effect.Effect<void>;
}

const POLL = Schedule.spaced("20 millis");
const ONCE = 1;
const isRunnerEvent = Schema.is(RunnerEventSchema);

function eventsFrom(on: WakeBoard, args: readonly string[]): Effect.Effect<readonly RunnerEvent[], never, Needs> {
  return Effect.map(runCookout({ args, env: { COOKOUT_STATE_DIR: on.folder } }), ({ stdout }) => {
    const lines = Arr.filter(Str.split("\n")(stdout), Str.isNonEmpty);
    return Arr.filter(Arr.map(lines, parseLine), isRunnerEvent);
  });
}

function runnerEventsIn(on: WakeBoard): Effect.Effect<readonly RunnerEvent[], never, Needs> {
  return eventsFrom(on, ["runner", "logs"]);
}

function runnerEventsOf({ agent, on }: AgentEvents): Effect.Effect<readonly RunnerEvent[], never, Needs> {
  return eventsFrom(on, ["runner", "logs", agent]);
}

function eventsOfKind({ agent, type }: EventKind): (events: readonly RunnerEvent[]) => readonly RunnerEvent[] {
  return (events) => Arr.filter(events, (event) => event.agent === agent && event.type === type);
}

function untilRunnerEvents({
  count = ONCE,
  on,
  ...kind
}: Awaited): Effect.Effect<readonly RunnerEvent[], never, Needs> {
  function counted(events: readonly RunnerEvent[]): boolean {
    return eventsOfKind(kind)(events).length >= count;
  }
  return TestClock.withLive(Effect.repeat(runnerEventsIn(on), { schedule: POLL, until: counted }));
}

function joinedWith(on: WakeBoard, releaseFile: string, log: string) {
  return ({
    command,
    name,
    settings,
    timeoutMinutes,
    waits,
  }: WakingAgent): Effect.Effect<readonly [string, BoardAgent], never, Needs> => {
    const waitFor = Option.match(
      Option.liftPredicate(waits, (wait) => wait === true),
      {
        onNone: () => ({}),
        onSome: () => ({ waitFor: releaseFile }),
      },
    );
    const given = { ack: true, ...settings, ...waitFor, log };
    return Effect.map(
      joinWaking({ command, name, on, settings: given, timeoutMinutes }),
      (agent) => [name, agent] as const,
    );
  };
}

function wakingAgents(agents: readonly WakingAgent[]): Effect.Effect<WakingAgents, never, Needs> {
  return Effect.gen(function* startWakingAgents() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const on = yield* wakeBoard;
    const releaseFile = path.join(on.folder, "release");
    const join = joinedWith(on, releaseFile, path.join(on.folder, "wake.log"));
    const joined = yield* Effect.forEach(agents, join, { concurrency: 1 });
    yield* startRunner({ COOKOUT_STATE_DIR: on.folder });
    const release = Effect.orDie(fs.writeFileString(releaseFile, "go"));
    return { joined: Record.fromEntries(joined), on, release };
  });
}

function joinedAgent({ name, waking }: Joined): Effect.Effect<BoardAgent> {
  return Effect.orDie(Effect.fromOption(Record.get(waking.joined, name)));
}

export {
  type EventKind,
  type RunnerEvent,
  type WakingAgent,
  type WakingAgents,
  eventsOfKind,
  joinedAgent,
  runnerEventsIn,
  runnerEventsOf,
  untilRunnerEvents,
  wakingAgents,
};
