import {
  Array as Arr,
  DateTime,
  Effect,
  FileSystem,
  Function,
  Option,
  Order,
  Path,
  Predicate,
  Ref,
  Schema,
  String as Str,
  Struct,
} from "effect";
import type { Scope } from "effect";
import { isoTimeOf } from "../../../time/server.ts";
import { stateFolderPath } from "./state-folder.ts";
import { stateJsonLines } from "./agent-session-state.ts";

const EVENT_LOG = "runner-events.jsonl";
const RUNS_FOLDER = "runs";
const RUN_OUTPUT_LIMIT = 1_048_576;
const PRIVATE_FILE = 0o600;
const PRIVATE_FOLDER = 0o700;
const TIME_DIGITS = 13;
const COUNT_DIGITS = 4;
const NOTHING = 0;
const ONE = 1;

const RunnerEventSchema = Schema.Struct({
  agent: Schema.String,
  at: Schema.String,
  dropped: Schema.optionalKey(Schema.Boolean),
  error: Schema.optionalKey(Schema.Struct({ code: Schema.String, message: Schema.String })),
  exitCode: Schema.optionalKey(Schema.Int),
  message: Schema.optionalKey(Schema.Int),
  messages: Schema.optionalKey(Schema.Array(Schema.Int)),
  output: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.Literals(["connection-refused", "no-inbox", "not-acked", "session-closed"])),
  timedOutAfterMinutes: Schema.optionalKey(Schema.Int),
  type: Schema.Literals([
    "runner-start",
    "connect",
    "mention",
    "delivered-live",
    "fell-back",
    "woken",
    "wake-run-start",
    "exit",
    "timeout",
    "wake-failed",
    "skip",
    "stand-down",
    "unregister",
    "refusal",
  ]),
});

type RunnerEvent = typeof RunnerEventSchema.Type;
type EventToLog = Omit<RunnerEvent, "agent" | "at">;

interface RunOutput {
  readonly file: string;
  readonly write: (chunk: Uint8Array) => Effect.Effect<void>;
}

interface RunnerLog {
  readonly record: (agent: string, event: EventToLog) => Effect.Effect<void>;
  readonly runOutput: (agent: string) => Effect.Effect<RunOutput, { readonly message: string }, Scope.Scope>;
}

type Ending = Omit<RunnerEvent, "agent" | "messages" | "output">;

interface LastRun {
  readonly ended?: Ending;
  readonly output: string;
  readonly startedAt: string;
}

interface Sized {
  readonly file: string;
  readonly size: number;
}

interface Files {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
}

const encodeEvent = Schema.encodeEffect(Schema.fromJsonString(RunnerEventSchema));
const eventsIn = stateJsonLines(RunnerEventSchema);

function padded(value: number, digits: number): string {
  return Str.padStart(digits, "0")(String(value));
}

function sizesIn({ fs, path }: Files, folder: string): Effect.Effect<readonly Sized[]> {
  return Effect.gen(function* listRunOutputs() {
    const names = yield* Effect.orElseSucceed(fs.readDirectory(folder), Arr.empty);
    return yield* Effect.forEach(
      Arr.sort(names, Order.String),
      (name) => {
        const file = path.join(folder, name);
        const size = Effect.orElseSucceed(
          Effect.map(fs.stat(file), (info) => Number(info.size)),
          Function.constant(NOTHING),
        );
        return Effect.map(size, (bytes) => ({ file, size: bytes }));
      },
      { concurrency: 1 },
    );
  });
}

interface Kept {
  readonly total: number;
  readonly old: readonly string[];
}

function overLimit(newestFirst: readonly Sized[]): readonly string[] {
  const none: Kept = { old: [], total: NOTHING };
  return Arr.reduce(newestFirst, none, ({ old, total }, { file, size }) => {
    const after = total + size;
    if (after > RUN_OUTPUT_LIMIT) {
      return { old: [...old, file], total };
    }
    return { old, total: after };
  }).old;
}

function rotate(files: Files, folder: string, current: string): Effect.Effect<void> {
  return Effect.gen(function* keepWithinLimit() {
    const before = yield* sizesIn(files, folder);
    const tooBig = Arr.some(before, ({ file, size }) => file === current && size > RUN_OUTPUT_LIMIT);
    yield* Effect.when(Effect.ignore(files.fs.truncate(current, RUN_OUTPUT_LIMIT)), Effect.succeed(tooBig));
    const sized = yield* sizesIn(files, folder);
    const newestFirst = Arr.reverse(sized);
    yield* Effect.forEach(overLimit(newestFirst), (file) => Effect.ignore(files.fs.remove(file)), {
      concurrency: 1,
      discard: true,
    });
  });
}

function recordIn(files: Files, stateFolder: string) {
  const log = files.path.join(stateFolder, EVENT_LOG);
  return (agent: string, event: EventToLog): Effect.Effect<void> =>
    Effect.gen(function* appendEvent() {
      const now = yield* DateTime.now;
      const text = yield* Effect.orDie(encodeEvent({ ...event, agent, at: isoTimeOf(now) }));
      yield* Effect.ignore(files.fs.writeFileString(log, `${text}\n`, { flag: "a", mode: PRIVATE_FILE }));
    });
}

function runOutputIn(files: Files, stateFolder: string, nextRun: Effect.Effect<number>) {
  return (agent: string): Effect.Effect<RunOutput, { readonly message: string }, Scope.Scope> =>
    Effect.gen(function* openRunOutput() {
      const { fs, path } = files;
      const folder = path.join(stateFolder, RUNS_FOLDER, Str.replaceAll("/", "~")(agent));
      yield* fs.makeDirectory(folder, { mode: PRIVATE_FOLDER, recursive: true });
      const now = yield* DateTime.now;
      const run = yield* nextRun;
      const name = `${padded(DateTime.toEpochMillis(now), TIME_DIGITS)}-${padded(run, COUNT_DIGITS)}.log`;
      const file = path.join(folder, name);
      const handle = yield* fs.open(file, { flag: "a", mode: PRIVATE_FILE });
      yield* Effect.addFinalizer(() => rotate(files, folder, file));
      return { file, write: (chunk: Uint8Array) => Effect.ignore(handle.writeAll(chunk)) };
    });
}

function runnerLog(stateFolder: string): Effect.Effect<RunnerLog, never, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* openRunnerLog() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const count = yield* Ref.make(NOTHING);
    const files = { fs, path };
    const nextRun = Ref.getAndUpdate(count, (counted) => counted + ONE);
    return { record: recordIn(files, stateFolder), runOutput: runOutputIn(files, stateFolder, nextRun) };
  });
}

function eventsInFolder({ fs, path }: Files) {
  return (folder: string): Effect.Effect<readonly RunnerEvent[]> => {
    const text = Effect.orElseSucceed(fs.readFileString(path.join(folder, EVENT_LOG)), Function.constant(""));
    return Effect.flatMap(text, eventsIn);
  };
}

const runnerEvents: Effect.Effect<readonly RunnerEvent[], never, FileSystem.FileSystem | Path.Path> = Effect.gen(
  function* readRunnerEvents() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const folder = yield* stateFolderPath;
    const events = yield* Effect.transposeOption(Option.map(folder, eventsInFolder({ fs, path })));
    return Option.getOrElse(events, Arr.empty);
  },
);

const endings: ReadonlySet<RunnerEvent["type"]> = new Set(["exit", "timeout", "wake-failed"]);

function endingOf(event: RunnerEvent): Ending {
  return Struct.omit(event, ["agent", "messages", "output"]);
}

function withEvent(runs: ReadonlyMap<string, LastRun>, event: RunnerEvent): ReadonlyMap<string, LastRun> {
  if (event.type === "wake-run-start") {
    return new Map([...runs, [event.agent, { output: event.output ?? "", startedAt: event.at }]]);
  }
  const going = Option.filter(Option.fromNullishOr(runs.get(event.agent)), (last) => Predicate.isUndefined(last.ended));
  return Option.match(
    Option.filter(going, () => endings.has(event.type)),
    {
      onNone: () => runs,
      onSome: (last) => new Map([...runs, [event.agent, { ...last, ended: endingOf(event) }]]),
    },
  );
}

function lastRuns(events: readonly RunnerEvent[]): ReadonlyMap<string, LastRun> {
  return Arr.reduce(events, new Map<string, LastRun>(), withEvent);
}

export { type EventToLog, type LastRun, type RunOutput, type RunnerLog, lastRuns, runnerEvents, runnerLog };
