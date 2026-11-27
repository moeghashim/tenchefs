import { Array as Arr, Effect, FileSystem, Function, Option, Path, Schema, String as Str } from "effect";
import { claudeConfigDir, home } from "../../../config/server.ts";
import type { Registration } from "./registrations.ts";
import { stateJson } from "./agent-session-state.ts";

const CLAUDE_CODE = "claude-code";
const SIGNAL_CHECK = 0;

const SessionFileSchema = Schema.Struct({
  cwd: Schema.optionalKey(Schema.String),
  messagingSocketPath: Schema.optionalKey(Schema.String),
  peerProtocol: Schema.optionalKey(Schema.Unknown),
  pid: Schema.Int,
  sessionId: Schema.String,
});

type SessionFile = typeof SessionFileSchema.Type;

interface Lookup {
  readonly folder: Option.Option<string>;
  readonly open: Option.Option<SessionFile>;
}

const decodeSessionFile = stateJson(SessionFileSchema);
const nothingToLookUp: Lookup = { folder: Option.none(), open: Option.none() };

function isAlive(pid: number): Effect.Effect<boolean> {
  return Effect.isSuccess(Effect.try({ catch: Function.constant(pid), try: () => process.kill(pid, SIGNAL_CHECK) }));
}

const claudeHome: Effect.Effect<Option.Option<string>, never, Path.Path> = Effect.gen(function* claudeConfigFolder() {
  const path = yield* Path.Path;
  const configured = yield* Effect.orDie(claudeConfigDir);
  const homeFolder = yield* Effect.orDie(home);
  if (Str.isNonEmpty(configured)) {
    return Option.some(configured);
  }
  return Option.map(Option.liftPredicate(homeFolder, Str.isNonEmpty), (folder) => path.join(folder, ".claude"));
});

function sessionFilesIn(
  folder: string,
): Effect.Effect<readonly SessionFile[], never, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* readSessionFiles() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sessions = path.join(folder, "sessions");
    const names = yield* Effect.orElseSucceed(fs.readDirectory(sessions), Arr.empty);
    function readOne(name: string): Effect.Effect<Option.Option<SessionFile>> {
      const text = Effect.orElseSucceed(fs.readFileString(path.join(sessions, name)), Function.constant(""));
      return Effect.flatMap(text, decodeSessionFile);
    }
    const read = yield* Effect.forEach(Arr.filter(names, Str.endsWith(".json")), readOne, { concurrency: 1 });
    return Arr.getSomes(read);
  });
}

function registeredSession(registration: Registration): Option.Option<string> {
  return Option.filter(Option.fromUndefinedOr(registration.sessionId), () =>
    Str.startsWith(CLAUDE_CODE)(registration.harness),
  );
}

function openAmong(files: readonly SessionFile[], registered: string): Effect.Effect<Option.Option<SessionFile>> {
  const named = Arr.filter(files, (file) => file.sessionId === registered);
  return Effect.map(
    Effect.filter(named, (file) => isAlive(file.pid), { concurrency: 1 }),
    Arr.head,
  );
}

function lookUp(registration: Registration): Effect.Effect<Lookup, never, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* findOpenSession() {
    const registered = registeredSession(registration);
    const folder = yield* claudeHome;
    if (Option.isNone(registered) || Option.isNone(folder)) {
      return nothingToLookUp;
    }
    const files = yield* sessionFilesIn(folder.value);
    const open = yield* openAmong(files, registered.value);
    return { folder, open };
  });
}

export { type Lookup, type SessionFile, isAlive, lookUp };
