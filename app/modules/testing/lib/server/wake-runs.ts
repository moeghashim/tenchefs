import { Array as Arr, Effect, FileSystem, Function, Option, Order, Path, Schema, String as Str } from "effect";
import { agentSessionStateFiles } from "./agent-sessions.ts";
import { parseLine } from "./cli.ts";

interface WakeLogLine {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly event: "start" | "end";
  readonly inbox: unknown;
  readonly messages: readonly number[];
  readonly stdin: string;
}

interface RegistrationFile {
  readonly content: unknown;
  readonly mode: number;
  readonly stateFileExists: boolean;
}

type Files = FileSystem.FileSystem | Path.Path;

const REGISTRATION_SUFFIX = ".registration.json";
const BESIDE_SUFFIXES = [REGISTRATION_SUFFIX, ".runner.json", ".dropped.json"];
const PERMISSIONS = 0o1000;

const Words = Schema.Array(Schema.String);
const Environment = Schema.Record(Schema.String, Schema.String);
const LoggedSchema = Schema.Struct({
  argv: Schema.optionalKey(Words),
  cwd: Schema.optionalKey(Schema.String),
  env: Schema.optionalKey(Environment),
  event: Schema.Literals(["start", "end"]),
  messages: Schema.Array(Schema.Int),
  stdin: Schema.optionalKey(Schema.String),
});
const isLogged = Schema.is(LoggedSchema);

const hasAgentSessionToken = Schema.is(Schema.Struct({ agentSessionToken: Schema.String }));
const hasAgent = Schema.is(Schema.Struct({ agent: Schema.String }));

function wakeLogLine({
  argv = [],
  cwd = "",
  env = {},
  event,
  messages,
  stdin = "",
}: {
  readonly argv?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly event: "start" | "end";
  readonly messages: readonly number[];
  readonly stdin?: string;
}): WakeLogLine {
  return { argv, cwd, env, event, inbox: parseLine(stdin), messages, stdin };
}

function wakeLog(file: string): Effect.Effect<readonly WakeLogLine[], never, FileSystem.FileSystem> {
  return Effect.gen(function* readWakeLog() {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(file);
    const parsed = Arr.map(Arr.filter(Str.split(text, "\n"), Str.isNonEmpty), parseLine);
    return Arr.map(Arr.filter(parsed, isLogged), wakeLogLine);
  }).pipe(Effect.orDie);
}

function wakeEvents(
  file: string,
): Effect.Effect<readonly (readonly [string, readonly number[]])[], never, FileSystem.FileSystem> {
  return Effect.map(
    wakeLog(file),
    Arr.map(({ event, messages }) => [event, messages] as const),
  );
}

function isStateFile(file: string): boolean {
  return !Arr.some(BESIDE_SUFFIXES, (suffix) => Str.endsWith(suffix)(file));
}

function fileKind(registrations: boolean): (file: string) => boolean {
  if (registrations) {
    return Str.endsWith(REGISTRATION_SUFFIX);
  }
  return isStateFile;
}

function filesIn(stateFolder: string, registrations: boolean): Effect.Effect<readonly string[], never, Files> {
  return Effect.map(agentSessionStateFiles(stateFolder), (files) => Arr.filter(files, fileKind(registrations)));
}

function registeredAgentsIn(stateFolder: string): Effect.Effect<readonly string[], never, Files> {
  return Effect.gen(function* readRegisteredAgents() {
    const fs = yield* FileSystem.FileSystem;
    const files = yield* filesIn(stateFolder, true);
    const texts = yield* Effect.forEach(files, (file) => fs.readFileString(file), { concurrency: 1 });
    const agents = Arr.filter(Arr.map(texts, parseLine), hasAgent);
    return Arr.sort(
      Arr.map(agents, ({ agent }) => agent),
      Order.String,
    );
  }).pipe(Effect.orDie);
}

function registrationIn(stateFolder: string): Effect.Effect<RegistrationFile, never, Files> {
  return Effect.gen(function* readRegistration() {
    const fs = yield* FileSystem.FileSystem;
    const [file = ""] = yield* filesIn(stateFolder, true);
    const info = yield* fs.stat(file);
    const stateFileExists = yield* fs.exists(Str.replace(REGISTRATION_SUFFIX, ".json")(file));
    const text = yield* fs.readFileString(file);
    return { content: parseLine(text), mode: info.mode % PERMISSIONS, stateFileExists };
  }).pipe(Effect.orDie);
}

function agentSessionTokenIn(stateFolder: string): Effect.Effect<Option.Option<string>, never, Files> {
  return Effect.gen(function* readAgentSessionToken() {
    const fs = yield* FileSystem.FileSystem;
    const [file = ""] = yield* filesIn(stateFolder, false);
    const text = yield* fs.readFileString(file);
    const state = Option.liftPredicate(parseLine(text), hasAgentSessionToken);
    return Option.map(state, ({ agentSessionToken }) => agentSessionToken);
  }).pipe(Effect.orDie);
}

function agentSessionTokensIn(stateFolder: string): Effect.Effect<readonly string[], never, Files> {
  return Effect.gen(function* readAgentSessionTokens() {
    const fs = yield* FileSystem.FileSystem;
    const files = yield* filesIn(stateFolder, false);
    const texts = yield* Effect.forEach(files, (file) => fs.readFileString(file), { concurrency: 1 });
    const states = Arr.filter(Arr.map(texts, parseLine), hasAgentSessionToken);
    return Arr.map(states, ({ agentSessionToken }) => agentSessionToken);
  }).pipe(Effect.orDie);
}

function textsIn(folder: string): Effect.Effect<readonly string[], never, Files> {
  return Effect.gen(function* readFolder() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const names = yield* Effect.orElseSucceed(fs.readDirectory(folder, { recursive: true }), Arr.empty);
    const files = Arr.map(names, (name) => path.join(folder, name));
    const texts = yield* Effect.forEach(
      files,
      (file) => Effect.orElseSucceed(Effect.asSome(fs.readFileString(file)), Option.none),
      { concurrency: 1 },
    );
    return Arr.getSomes(texts);
  });
}

function runnerWritten(stateFolder: string): Effect.Effect<string, never, Files> {
  return Effect.gen(function* readRunnerFiles() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const events = yield* Effect.orElseSucceed(
      fs.readFileString(path.join(stateFolder, "runner-events.jsonl")),
      Function.constant(""),
    );
    const runs = yield* textsIn(path.join(stateFolder, "runs"));
    const sessions = yield* agentSessionStateFiles(stateFolder);
    const beside = Arr.filter(
      sessions,
      (file) => Str.endsWith(".runner.json")(file) || Str.endsWith(".dropped.json")(file),
    );
    const besideTexts = yield* Effect.forEach(beside, (file) => fs.readFileString(file), { concurrency: 1 });
    return Arr.join([events, ...runs, ...besideTexts], "\n");
  }).pipe(Effect.orDie);
}

export {
  type RegistrationFile,
  type WakeLogLine,
  agentSessionTokenIn,
  agentSessionTokensIn,
  registeredAgentsIn,
  registrationIn,
  runnerWritten,
  wakeEvents,
  wakeLog,
};
