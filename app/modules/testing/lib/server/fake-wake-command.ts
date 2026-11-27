import {
  Array as Arr,
  Config,
  Effect,
  FileSystem,
  Option,
  Path,
  Record,
  Schema,
  Scope,
  Stdio,
  String as Str,
  Stream,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import type { CookoutClient } from "../../../sdk/index.ts";
import type { MessageId } from "../../../messages/index.ts";
import { createCookoutClient } from "../../../sdk/index.ts";
import { isMessageId } from "../../../messages/index.ts";
import { layer as nodeServices } from "@effect/platform-node/NodeServices";
import { parseLine } from "./cli.ts";
import { runMain } from "@effect/platform-node/NodeRuntime";

const FIRST_ARGUMENT = 2;
const SUCCESS = 0;
const POLL = "10 millis";
const CHILD_SECONDS = "600";
const MAIN = new URL("../../../../main.ts", import.meta.url);

const SettingsSchema = Schema.Struct({
  ack: Schema.optionalKey(Schema.Boolean),
  childPidFile: Schema.optionalKey(Schema.String),
  exitCode: Schema.optionalKey(Schema.Int),
  hang: Schema.optionalKey(Schema.Boolean),
  log: Schema.String,
  print: Schema.optionalKey(Schema.String),
  printRepeat: Schema.optionalKey(Schema.Int),
  reply: Schema.optionalKey(Schema.String),
  sdkReply: Schema.optionalKey(Schema.String),
  succeedAfter: Schema.optionalKey(Schema.String),
  tokenFile: Schema.optionalKey(Schema.String),
  touch: Schema.optionalKey(Schema.String),
  waitFor: Schema.optionalKey(Schema.String),
});

type Settings = typeof SettingsSchema.Type;

const ItemSchema = Schema.Struct({
  channel: Schema.Struct({ name: Schema.String }),
  message: Schema.Struct({ id: Schema.Int }),
});

const InboxSchema = Schema.Struct({ items: Schema.NonEmptyArray(ItemSchema) });

type Item = typeof ItemSchema.Type;

type Inbox = typeof InboxSchema.Type;

interface Woken {
  readonly item: Item;
  readonly settings: Settings;
}

type Needs = ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path;

const isSettings = Schema.is(SettingsSchema);
const isInbox = Schema.is(InboxSchema);
const encodeLine = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

const [sessionId = "", settingsText = ""] = process.argv.slice(FIRST_ARGUMENT);

function appendLine(log: string, line: unknown): Effect.Effect<void, never, FileSystem.FileSystem> {
  return Effect.gen(function* appendLogLine() {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* Effect.orDie(encodeLine(line));
    yield* fs.writeFileString(log, `${text}\n`, { flag: "a" });
  }).pipe(Effect.orDie);
}

function entryOf(line: string): readonly [string, string] {
  const [name, ...value] = Str.split("=")(line);
  return [name, Arr.join(value, "=")];
}

function spawnedEnvironment(): Effect.Effect<Readonly<Record<string, string>>, never, Needs> {
  return Effect.gen(function* readOwnEnvironment() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const lines = yield* spawner.lines(ChildProcess.make("env", [], { extendEnv: true }));
    return Record.fromEntries(Arr.map(lines, entryOf));
  }).pipe(Effect.orDie);
}

function cookout(args: readonly string[]): Effect.Effect<void, never, Needs> {
  return Effect.gen(function* runCookout() {
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const main = yield* Effect.orDie(path.fromFileUrl(MAIN));
    const env = { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: sessionId };
    const exitCode = yield* spawner.exitCode(
      ChildProcess.make(process.execPath, [main, ...args], { env, extendEnv: true, stderr: "inherit" }),
    );
    yield* Effect.when(
      Effect.die(`cookout ${Arr.join(args, " ")} exited ${String(exitCode)}`),
      Effect.succeed(exitCode !== SUCCESS),
    );
  }).pipe(Effect.orDie);
}

function waitUntilExists(file: string): Effect.Effect<void, never, FileSystem.FileSystem> {
  return Effect.gen(function* pollForFile() {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(file);
    if (!exists) {
      yield* Effect.sleep(POLL);
      yield* waitUntilExists(file);
    }
  }).pipe(Effect.orDie);
}

function messagesOf(inbox: Inbox): readonly number[] {
  return Arr.map(inbox.items, ({ message }) => message.id);
}

function started(inbox: Inbox, settings: Settings, stdin: string): Effect.Effect<void, never, Needs> {
  return Effect.gen(function* logStart() {
    const env = yield* spawnedEnvironment();
    const line = { argv: process.argv.slice(FIRST_ARGUMENT), cwd: process.cwd(), env, event: "start", stdin };
    yield* appendLine(settings.log, { ...line, messages: messagesOf(inbox) });
  }).pipe(Effect.orDie);
}

function ifSet(
  value: string | undefined,
  then: (text: string) => Effect.Effect<void, never, Needs>,
): Effect.Effect<void, never, Needs> {
  return Option.match(Option.fromNullishOr(value), { onNone: () => Effect.void, onSome: then });
}

function reply({ item, settings }: Woken): Effect.Effect<void, never, Needs> {
  return ifSet(settings.reply, (text) =>
    cookout(["message", "post", item.channel.name, text, "--reply-to", String(item.message.id)]),
  );
}

function isNewer(item: Item, held: Option.Option<Item>): boolean {
  return Option.match(held, { onNone: () => true, onSome: ({ message }) => message.id < item.message.id });
}

function newestPerChannel(inbox: Inbox): readonly Item[] {
  const newest = Arr.reduce(inbox.items, new Map<string, Item>(), (byChannel, item) => {
    const held = Option.fromNullishOr(byChannel.get(item.channel.name));
    if (isNewer(item, held)) {
      return new Map([...byChannel, [item.channel.name, item]]);
    }
    return byChannel;
  });
  return [...newest.values()];
}

function clientOf(tokenFile: string): Effect.Effect<CookoutClient, never, Needs> {
  return Effect.gen(function* clientWithToken() {
    const fs = yield* FileSystem.FileSystem;
    const token = yield* Effect.orDie(fs.readFileString(tokenFile));
    const url = yield* Effect.orDie(Config.String("COOKOUT_URL"));
    return createCookoutClient({ env: {}, token, url });
  });
}

function idsIn(items: readonly Item[]): readonly MessageId[] {
  return Arr.filter(
    Arr.map(items, ({ message }) => message.id),
    isMessageId,
  );
}

function throughSdk(inbox: Inbox, settings: Settings) {
  return (tokenFile: string): Effect.Effect<void, never, Needs> =>
    Effect.gen(function* answerThroughSdk() {
      const client = yield* clientOf(tokenFile);
      const replies = ifSet(settings.sdkReply, (text) =>
        Effect.forEach(
          inbox.items,
          ({ channel, message }) =>
            Effect.promise(() => client.createMessage({ channel: channel.name, replyTo: message.id, text })),
          { concurrency: "unbounded", discard: true },
        ),
      );
      yield* replies;
      const acks = Effect.forEach(idsIn(newestPerChannel(inbox)), (id) => Effect.promise(() => client.ack(id)), {
        concurrency: "unbounded",
        discard: true,
      });
      yield* Effect.when(acks, Effect.succeed(settings.ack === true));
    });
}

function answerAll(inbox: Inbox, settings: Settings): Effect.Effect<void, never, Needs> {
  return Effect.gen(function* answerMentions() {
    const fs = yield* FileSystem.FileSystem;
    const messages = Arr.join(Arr.map(messagesOf(inbox), String), " ");
    yield* ifSet(settings.touch, (file) => Effect.orDie(fs.writeFileString(file, messages)));
    yield* ifSet(settings.waitFor, waitUntilExists);
    const replies = Arr.map(inbox.items, (item) => reply({ item, settings }));
    const sdk = ifSet(settings.tokenFile, throughSdk(inbox, settings));
    yield* Effect.all([...replies, sdk], { concurrency: "unbounded", discard: true });
  }).pipe(Effect.orDie);
}

function childOf(pidFile: string): Effect.Effect<void, never, Needs> {
  return Effect.gen(function* startChild() {
    const fs = yield* FileSystem.FileSystem;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const neverClosed = Scope.makeUnsafe();
    const child = ChildProcess.make("sleep", [CHILD_SECONDS], { detached: false, stdin: "ignore" });
    const handle = yield* Scope.provide(neverClosed)(spawner.spawn(child));
    yield* fs.writeFileString(pidFile, String(handle.pid));
  }).pipe(Effect.orDie);
}

const ONCE = 1;

function printed(settings: Settings) {
  return (text: string): Effect.Effect<void> =>
    Effect.sync(() => {
      const repeated = Str.repeat(settings.printRepeat ?? ONCE)(text);
      process.stdout.write(`${repeated}\n`);
      process.stderr.write(`${repeated}\n`);
    });
}

function exitCodeOf(settings: Settings): Effect.Effect<number, never, FileSystem.FileSystem> {
  const failing = Option.getOrElse(Option.fromNullishOr(settings.exitCode), () => SUCCESS);
  return Option.match(Option.fromNullishOr(settings.succeedAfter), {
    onNone: () => Effect.succeed(failing),
    onSome: (file) =>
      Effect.flatMap(FileSystem.FileSystem, (fs) =>
        Effect.map(Effect.orDie(fs.exists(file)), (succeeds) => {
          if (succeeds) {
            return SUCCESS;
          }
          return failing;
        }),
      ),
  });
}

function inboxOf(stdin: string): Effect.Effect<Inbox> {
  const inbox = parseLine(stdin);
  if (isInbox(inbox)) {
    return Effect.succeed(inbox);
  }
  return Effect.die(`not an inbox: ${stdin}`);
}

function wake(settings: Settings): Effect.Effect<void, never, Needs | Stdio.Stdio> {
  return Effect.gen(function* fakeWakeRun() {
    const stdio = yield* Stdio.Stdio;
    const stdin = yield* Effect.orDie(stdio.stdin.pipe(Stream.decodeText, Stream.mkString));
    const inbox = yield* inboxOf(stdin);
    yield* started(inbox, settings, stdin);
    yield* ifSet(settings.print, printed(settings));
    yield* ifSet(settings.childPidFile, childOf);
    yield* answerAll(inbox, settings);
    yield* Effect.when(Effect.never, Effect.succeed(settings.hang === true));
    yield* appendLine(settings.log, { event: "end", messages: messagesOf(inbox) });
    process.exitCode = yield* exitCodeOf(settings);
  });
}

const settings = parseLine(settingsText);

runMain(
  Effect.suspend(() => {
    if (!isSettings(settings)) {
      return Effect.die(`not fake wake settings: ${settingsText}`);
    }
    return wake(settings);
  }).pipe(Effect.provide(nodeServices)),
);
