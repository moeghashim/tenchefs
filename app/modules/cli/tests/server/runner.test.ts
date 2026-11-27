import { Array as Arr, Effect, FileSystem, Option, Order, Path, Record, Schema, String as Str } from "effect";
import type {
  BoardAgent,
  CommandLineNeeds,
  FakeWakeSettings,
  StartedRunner,
  TestCookout,
  WakeBoard,
  WakeLogLine,
} from "../../../testing/server.ts";
import {
  WAKE_CHANNEL,
  agentSessionTokenIn,
  answer,
  boardAgent,
  commandLineServices,
  joinWaking,
  mention,
  mentions,
  registrationIn,
  runCookout,
  startRunner,
  testCookout,
  wakeBoard,
  wakeEvents,
  wakeLog,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { MessageId } from "../../../messages/index.ts";
import type { Scope } from "effect";

interface WokenOnce {
  readonly joined: BoardAgent;
  readonly lines: readonly unknown[];
  readonly log: readonly WakeLogLine[];
  readonly message: { readonly id: MessageId };
  readonly on: WakeBoard;
  readonly runner: StartedRunner;
}

interface TwoAgents {
  readonly log: string;
  readonly on: WakeBoard;
  readonly release: Effect.Effect<void>;
  readonly runner: StartedRunner;
}

type WakeSettings = Omit<FakeWakeSettings, "log">;

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const PRIVATE_FILE = 0o600;
const ONE_RUN = 1;
const TWO_LINES = 2;
const FOUR_LINES = 4;
const NO_MESSAGE = 0;
const HOSTILE = "@brigid look: $(touch pwned) `touch pwned` ; touch pwned 'single' \"double\"";
const WAKE = ["claude", "-p", "--resume", "{session-id}", "--allowedTools", "Bash(cookout:*)"];
const isRun = Schema.is(Schema.Struct({ agent: Schema.String }));
const encode = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

type Needs = CommandLineNeeds | TestCookout | Scope.Scope;

function isMessage(id: MessageId) {
  return ({ message }: { readonly message: { readonly id: MessageId } }): boolean => message.id === id;
}

function wakeBrigidOnce(text: string, settings: WakeSettings): Effect.Effect<WokenOnce, never, Needs> {
  return Effect.gen(function* wakeOnce() {
    const path = yield* Path.Path;
    const on = yield* wakeBoard;
    const file = path.join(on.folder, "wake.log");
    const joined = yield* joinWaking({ name: "brigid", on, settings: { ...settings, log: file } });
    const runner = yield* startRunner({ COOKOUT_STATE_DIR: on.folder });
    const message = { id: yield* mention({ ada: on.ada, text }) };
    const lines = yield* runner.stdoutLines(ONE_RUN);
    const log = yield* wakeLog(file);
    return { joined, lines, log, message, on, runner };
  });
}

function brigidAndCormac(cormacTouches: boolean): Effect.Effect<TwoAgents, never, Needs> {
  return Effect.gen(function* joinTwoAgents() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const on = yield* wakeBoard;
    const log = path.join(on.folder, "wake.log");
    const release = path.join(on.folder, "release");
    yield* joinWaking({ name: "brigid", on, settings: { ack: true, log, waitFor: release } });
    yield* joinWaking({ name: "cormac", on, settings: { ack: true, log, ...(cormacTouches && { touch: release }) } });
    const runner = yield* startRunner({ COOKOUT_STATE_DIR: on.folder });
    return { log, on, release: Effect.orDie(fs.writeFileString(release, "go")), runner };
  });
}

it.effect.each([
  { how: "join --wake", steps: [["join", "--as", "brigid", "--wake", "--", ...WAKE]] },
  {
    how: "runner register",
    steps: [
      ["join", "--as", "brigid"],
      ["runner", "register", "--", ...WAKE],
    ],
  },
])(
  "$how writes a mode-600 registration beside the state file, with the session ID filled in",
  ({ steps }: { readonly steps: readonly (readonly string[])[] }) =>
    Effect.gen(function* registered() {
      const path = yield* Path.Path;
      const on = yield* wakeBoard;
      const joined = yield* boardAgent({ board: on, name: "brigid" });
      const results = yield* Effect.forEach(steps, (args) => runCookout({ args, env: joined.env }), { concurrency: 1 });
      const file = yield* registrationIn(on.folder);

      expect(Arr.map(results, ({ exitCode }) => exitCode)).toStrictEqual(Arr.map(steps, () => EXIT_SUCCESS));
      expect(file).toStrictEqual({
        content: {
          agent: "brigid",
          directory: path.resolve("."),
          harness: "claude-code",
          path: joined.env["PATH"],
          sessionId: joined.harnessSession,
          url: on.url,
          wakeCommand: ["claude", "-p", "--resume", joined.harnessSession, "--allowedTools", "Bash(cookout:*)"],
        },
        mode: PRIVATE_FILE,
        stateFileExists: true,
      });
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("runner register in a harness session that hasn't joined is refused with not_joined", () =>
  Effect.gen(function* notJoined() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const on = yield* wakeBoard;
    const { env } = yield* boardAgent({ board: on, name: "brigid" });
    const result = yield* runCookout({ args: ["runner", "register", "--", "claude"], env });
    const folderMade = yield* Effect.orDie(fs.exists(path.join(on.folder, "agent-sessions")));

    expect(result).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "not_joined" } } });
    expect(folderMade).toBe(false);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a mention wakes the registered agent once, in its folder with its PATH, and it replies", () =>
  Effect.gen(function* wakeOnMention() {
    const path = yield* Path.Path;
    const { joined, lines, log, message, on, runner } = yield* wakeBrigidOnce("@brigid are you there?", {
      ack: true,
      reply: "awake",
    });
    const thread = yield* answer(() => on.ada.client.getThread(message.id));

    expect(runner.firstStderr).toStrictEqual({ waking: ["brigid"] });
    expect(lines).toStrictEqual([{ agent: "brigid", exitCode: 0, messages: [message.id], type: "wake-run" }]);
    expect(log).toMatchObject([
      {
        cwd: path.resolve("."),
        env: { PATH: joined.env["PATH"] },
        event: "start",
        inbox: { items: [{ channel: { name: WAKE_CHANNEL }, message: { id: message.id }, reasons: ["mention"] }] },
      },
      { event: "end", messages: [message.id] },
    ]);
    expect(Arr.map(log, ({ argv }) => Arr.take(argv, ONE_RUN))).toStrictEqual([[joined.harnessSession], []]);
    expect(Arr.map(thread.replies, (reply) => [reply.author.name, reply.text])).toStrictEqual([["brigid", "awake"]]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a mention's text reaches the wake run on stdin only, verbatim, and runs nothing", () =>
  Effect.gen(function* hostileMention() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { log } = yield* wakeBrigidOnce(HOSTILE, { ack: true });
    const words = Arr.flatMap(log, ({ argv, env }) => [...argv, ...Record.values(env)]);
    const pwned = yield* Effect.orDie(fs.exists(path.resolve("pwned")));

    expect(log).toMatchObject([{ inbox: { items: [{ message: { text: HOSTILE } }] } }, { event: "end" }]);
    expect(Arr.filter(words, Str.includes("pwned"))).toStrictEqual([]);
    expect(pwned).toBe(false);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("no token reaches the wake run's environment or anything the runner prints", () =>
  Effect.gen(function* noTokens() {
    const { joined, lines, log, on, runner } = yield* wakeBrigidOnce("@brigid hello", { ack: true });
    const token = yield* agentSessionTokenIn(on.folder);
    const errors = yield* runner.stderrLines(ONE_RUN);
    const everything = yield* Effect.orDie(encode([lines, errors, log]));
    const names = Arr.map(log, ({ env }) => Arr.sort(Record.keys(env), Order.String));

    expect(names).toStrictEqual([["COOKOUT_STATE_DIR", "COOKOUT_URL", "COOKOUT_WAKE_RUN", "PATH"], []]);
    expect(Option.isSome(token)).toBe(true);
    expect(everything).not.toContain(Option.getOrElse(token, () => joined.agent.token));
    expect(everything).not.toContain(joined.agent.token);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a mention heard during an agent's wake run waits until that run has exited", () =>
  Effect.gen(function* oneRunAtATime() {
    const { log, on, release, runner } = yield* brigidAndCormac(false);
    const [first = NO_MESSAGE, second = NO_MESSAGE, meanwhile = NO_MESSAGE] = yield* mentions({
      ada: on.ada,
      texts: ["@brigid one", "@brigid two", "@cormac meanwhile"],
    });
    const before = yield* runner.stdoutLines(TWO_LINES);
    const whileWaiting = yield* wakeEvents(log);
    const lines = yield* Effect.andThen(release, runner.stdoutLines(FOUR_LINES));
    const after = yield* wakeEvents(log);

    expect(before).toMatchObject([
      { agent: "brigid", message: second, type: "mention-waiting" },
      { agent: "cormac", messages: [meanwhile], type: "wake-run" },
    ]);
    expect(whileWaiting).not.toContainEqual(["start", [second]]);
    expect(Arr.drop(lines, TWO_LINES)).toMatchObject([
      { messages: [first], type: "wake-run" },
      { messages: [second], type: "wake-run" },
    ]);
    expect(Arr.filter(after, ([, messages]) => !Arr.contains(messages, meanwhile))).toStrictEqual([
      ["start", [first]],
      ["end", [first]],
      ["start", [second]],
      ["end", [second]],
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("two agents' wake runs run at once", () =>
  Effect.gen(function* twoAgentsAtOnce() {
    const { on, runner } = yield* brigidAndCormac(true);
    yield* mentions({ ada: on.ada, texts: ["@brigid waits for cormac", "@cormac lets brigid go"] });
    const lines = yield* runner.stdoutLines(TWO_LINES);
    const agents = Arr.sort(
      Arr.map(Arr.filter(lines, isRun), ({ agent }) => agent),
      Order.String,
    );

    expect(agents).toStrictEqual(["brigid", "cormac"]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("the runner never acks: the woken agent's unacked mention stays unread, as the item it was given", () =>
  Effect.gen(function* noAck() {
    const { joined, log, message } = yield* wakeBrigidOnce("@brigid don't ack this", {});
    const { items } = yield* answer(() => joined.agent.client.inbox());

    expect(Arr.map(items, ({ message: { id } }) => id)).toContain(message.id);
    expect(Arr.map(log, ({ inbox }) => inbox)).toContainEqual({ items: Arr.filter(items, isMessage(message.id)) });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a woken agent that acks its mention leaves it read", () =>
  Effect.gen(function* acked() {
    const { joined, message } = yield* wakeBrigidOnce("@brigid ack this", { ack: true });
    const { items } = yield* answer(() => joined.agent.client.inbox());

    expect(Arr.map(items, ({ message: { id } }) => id)).not.toContain(message.id);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
