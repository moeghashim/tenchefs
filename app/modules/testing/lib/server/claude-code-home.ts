import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { Effect, FileSystem, Function, Option, Path, Ref, Schema } from "effect";
import type { FakeInbox } from "./fake-inbox.ts";
import type { Scope } from "effect";
import { fakeInbox } from "./fake-inbox.ts";
import { parseLine } from "./cli.ts";

type Files = FileSystem.FileSystem | Path.Path;
type Spawns = ChildProcessSpawner.ChildProcessSpawner | Files | Scope.Scope;

type Inbox = "listening" | "missing" | "refusing";

interface FakeClaudeSession {
  readonly harnessSession: string;
  readonly inbox?: Inbox;
  readonly launchedWith?: readonly string[];
  readonly peerProtocol?: number;
  readonly pid?: number;
  readonly projectSettings?: unknown;
  readonly userSettings?: unknown;
}

interface Reader {
  readonly lines: Effect.Effect<readonly string[]>;
  readonly nextLine: Effect.Effect<string>;
}

interface ClaudeCodeHome extends Reader {
  readonly folder: string;
}

interface Opened {
  readonly at: Option.Option<string>;
  readonly listening: FakeInbox;
}

interface Folders {
  readonly cwd: string;
  readonly folder: string;
}

interface Layout extends Folders {
  readonly socket: Option.Option<string>;
}

const PROTOCOL = 1;
const SentLineSchema = Schema.Struct({
  message: Schema.Struct({ content: Schema.String, role: Schema.Literal("user") }),
  msgV: Schema.Literal(PROTOCOL),
  msg_id: Schema.String,
  priority: Schema.Literal("next"),
  type: Schema.Literal("user"),
});
const InboxItemSchema = Schema.Struct({ message: Schema.Struct({ id: Schema.Int, text: Schema.String }) });
const InboxJsonSchema = Schema.Struct({ items: Schema.Array(InboxItemSchema) });
const isSentLine = Schema.is(SentLineSchema);
const isInboxJson = Schema.is(InboxJsonSchema);

type SentLine = typeof SentLineSchema.Type;
type InboxJson = typeof InboxJsonSchema.Type;
const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

function writeJson(file: string, value: unknown): Effect.Effect<void, never, FileSystem.FileSystem> {
  return Effect.gen(function* writeJsonFile() {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* encodeJson(value);
    yield* fs.writeFileString(file, text);
  }).pipe(Effect.orDie);
}

const IDLE = "setInterval(() => {}, 2 ** 30)";

function launched(args: readonly string[]): Effect.Effect<number, never, Spawns> {
  return Effect.gen(function* launchIdleProcess() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(ChildProcess.make(process.execPath, ["-e", IDLE, "--", ...args]));
    return Number(handle.pid);
  }).pipe(Effect.orDie);
}

function pidOf({ launchedWith, pid = process.pid }: FakeClaudeSession): Effect.Effect<number, never, Spawns> {
  return Option.match(Option.fromUndefinedOr(launchedWith), {
    onNone: Function.constant(Effect.succeed(pid)),
    onSome: launched,
  });
}

const noLines: FakeInbox = { nextLine: Effect.never, waiting: Effect.succeed([]) };

function inboxAt(inbox: Inbox, socket: string): Effect.Effect<Opened, never, Spawns> {
  return Effect.gen(function* makeInbox() {
    const fs = yield* FileSystem.FileSystem;
    const at = Option.liftPredicate(socket, () => inbox !== "missing");
    if (inbox === "listening") {
      const listening = yield* fakeInbox(socket);
      return { at, listening };
    }
    if (inbox === "refusing") {
      yield* Effect.orDie(fs.writeFileString(socket, "not a socket"));
    }
    return { at, listening: noLines };
  });
}

function writeSessionFile(
  session: FakeClaudeSession & { readonly pid: number },
  { cwd, folder, socket }: Layout,
): Effect.Effect<void, never, Files> {
  return Effect.gen(function* writeSession() {
    const path = yield* Path.Path;
    const { harnessSession, peerProtocol = PROTOCOL, pid } = session;
    const messaging = Option.match(socket, {
      onNone: () => ({}),
      onSome: (messagingSocketPath) => ({ messagingSocketPath }),
    });
    const file = { cwd, kind: "interactive", peerProtocol, pid, sessionId: harnessSession, ...messaging };
    yield* writeJson(path.join(folder, "sessions", `${String(pid)}.json`), file);
  });
}

function writeSettings(session: FakeClaudeSession, { cwd, folder }: Layout): Effect.Effect<void, never, Files> {
  return Effect.gen(function* writeSettingsFiles() {
    const path = yield* Path.Path;
    if ("userSettings" in session) {
      yield* writeJson(path.join(folder, "settings.json"), session.userSettings);
    }
    if ("projectSettings" in session) {
      yield* writeJson(path.join(cwd, ".claude", "settings.json"), session.projectSettings);
    }
  });
}

function folders(): Effect.Effect<Folders, never, Files | Scope.Scope> {
  return Effect.gen(function* makeFolders() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const folder = yield* Effect.orDie(fs.makeTempDirectoryScoped({ prefix: "cc-" }));
    const cwd = path.join(folder, "project");
    yield* Effect.orDie(fs.makeDirectory(path.join(folder, "sessions")));
    yield* Effect.orDie(fs.makeDirectory(path.join(cwd, ".claude"), { recursive: true }));
    return { cwd, folder };
  });
}

function readerOf({ nextLine, waiting }: FakeInbox): Effect.Effect<Reader> {
  return Effect.gen(function* readLines() {
    const seen = yield* Ref.make<readonly string[]>([]);
    return {
      lines: Effect.flatMap(waiting, (more) => Ref.updateAndGet(seen, (lines) => [...lines, ...more])),
      nextLine: Effect.tap(nextLine, (line) => Ref.update(seen, (lines) => [...lines, line])),
    };
  });
}

function sentLine(line: string): Option.Option<SentLine> {
  return Option.liftPredicate(parseLine(line), isSentLine);
}

function inboxJson(text: string): Option.Option<InboxJson> {
  return Option.liftPredicate(parseLine(text), isInboxJson);
}

function claudeCodeHome(session: FakeClaudeSession): Effect.Effect<ClaudeCodeHome, never, Spawns> {
  return Effect.gen(function* makeClaudeCodeHome() {
    const path = yield* Path.Path;
    const { cwd, folder } = yield* folders();
    const { at, listening } = yield* inboxAt(session.inbox ?? "listening", path.join(folder, "in.sock"));
    const pid = yield* pidOf(session);
    yield* writeSessionFile({ ...session, pid }, { cwd, folder, socket: at });
    yield* writeSettings(session, { cwd, folder, socket: at });
    const reader = yield* readerOf(listening);
    return { folder, ...reader };
  });
}

export { type ClaudeCodeHome, type FakeClaudeSession, type SentLine, claudeCodeHome, inboxJson, sentLine };
