import type {
  CliResult,
  CommandLineNeeds,
  CuttableLink,
  TestCookoutService,
  TestIdentity,
} from "../../../testing/server.ts";
import { Effect, Fiber, String as Str } from "effect";
import {
  TestCookout,
  answer,
  commandLineServices,
  cuttableLink,
  freshStateFolder,
  runCookout,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { MessageId } from "../../../messages/index.ts";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";

interface Watch {
  readonly ann: TestIdentity;
  readonly bob: TestIdentity;
  readonly cookout: TestCookoutService;
  readonly folder: string;
  readonly link: CuttableLink;
}

type Needs = CommandLineNeeds | Scope.Scope;

interface WatchUntilExit<During> {
  readonly args: readonly string[];
  readonly env?: (watch: Watch) => Readonly<Record<string, string>>;
  readonly prepare?: (watch: Watch) => Effect.Effect<void, never, Needs>;
  readonly whileWatching: (watch: Watch) => Effect.Effect<During, never, Needs>;
}

interface Exited<During> {
  readonly during: During;
  readonly result: CliResult;
  readonly stdoutLines: readonly string[];
}

const ONE_LINE = 1;
const NEWLINE = "\n";
const A_WHILE = "5 seconds";
const EXIT_SUCCESS = 0;
const EXIT_REFUSED = 1;
const TWICE = 2;
const EXIT_TIMEOUT = 2;
const EXIT_TOKEN = 3;
const EXIT_ENDED = 4;

const passTime = Effect.forever(Effect.andThen(TestClock.adjust(A_WHILE), Effect.yieldNow));

function mention(ann: TestIdentity, text: string): Effect.Effect<MessageId> {
  return Effect.map(
    answer(() => ann.client.createMessage({ channel: "grill", text })),
    ({ message }) => message.id,
  );
}

const board: Effect.Effect<Watch, never, TestCookout | Needs> = Effect.gen(function* annBobAndALink() {
  const cookout = yield* TestCookout;
  const link = yield* cuttableLink(cookout.url);
  const ann = yield* cookout.createIdentity("ann");
  const bob = yield* cookout.createIdentity("bob");
  const folder = yield* freshStateFolder;
  yield* answer(() => ann.client.createChannel({ name: "grill" }));
  return { ann, bob, cookout, folder, link };
});

function envOf({ bob, link }: Watch, folder: string): Readonly<Record<string, string>> {
  const session = { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: folder };
  return { ...session, COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: bob.token, COOKOUT_URL: link.url };
}

function watchUntilExit<During>({
  args,
  env = (watch) => envOf(watch, watch.folder),
  prepare = () => Effect.void,
  whileWatching,
}: WatchUntilExit<During>): Effect.Effect<Exited<During>, never, Needs> {
  return Effect.gen(function* watchAsBob() {
    const watch = yield* board;
    yield* prepare(watch);
    const watching = yield* Effect.forkScoped(runCookout({ args, env: env(watch) }));
    yield* watch.link.relayed("event: connected");
    const during = yield* whileWatching(watch);
    const result = yield* Effect.raceFirst(Fiber.join(watching), Effect.andThen(passTime, Effect.never));
    return { during, result, stdoutLines: Str.split(result.stdout, NEWLINE) };
  }).pipe(Effect.provide(testCookout()));
}

function cutAfter(change: (watch: Watch) => Effect.Effect<unknown>): (watch: Watch) => Effect.Effect<void> {
  return (watch) => Effect.andThen(change(watch), watch.link.cut);
}

function joinIn(watch: Watch, folder: string, flags: readonly string[] = []): Effect.Effect<void, never, Needs> {
  return Effect.asVoid(runCookout({ args: ["join", "--as", "bob", ...flags], env: envOf(watch, folder) }));
}

it.effect("cookout watch prints one stdout line and exits 3 when its token is rotated", () =>
  Effect.gen(function* watchRotated() {
    const { result, stdoutLines } = yield* watchUntilExit({
      args: ["watch"],
      whileWatching: cutAfter(({ cookout }) => answer(() => cookout.client.rotateToken("bob"))),
    });

    expect(result.exitCode).toBe(EXIT_TOKEN);
    expect(stdoutLines).toStrictEqual([expect.stringMatching(/^cookout watch stopped: .*\(token_revoked\)$/u)]);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("cookout watch --json prints one JSON error line and exits 3 when its identity is deactivated", () =>
  Effect.gen(function* watchDeactivated() {
    const { result, stdoutLines } = yield* watchUntilExit({
      args: ["watch", "--json"],
      whileWatching: cutAfter(({ cookout }) => answer(() => cookout.client.deactivateIdentity("bob"))),
    });

    expect(result).toMatchObject({ exitCode: EXIT_TOKEN, stdoutJson: { error: { code: "token_revoked" } } });
    expect(stdoutLines).toHaveLength(ONE_LINE);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("cookout watch prints one stdout line and exits 4 when another session runs join --force", () =>
  Effect.gen(function* watchTakenOver() {
    const { result, stdoutLines } = yield* watchUntilExit({
      args: ["watch", "--json"],
      env: (watch) => ({ ...envOf(watch, watch.folder), COOKOUT_TOKEN: "" }),
      prepare: (watch) => joinIn(watch, watch.folder),
      whileWatching: (watch) => Effect.flatMap(freshStateFolder, (folder) => joinIn(watch, folder, ["--force"])),
    });

    expect(result).toMatchObject({ exitCode: EXIT_ENDED, stdoutJson: { error: { code: "agent_session_revoked" } } });
    expect(stdoutLines).toHaveLength(ONE_LINE);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("cookout watch --once exits 0 after printing the first new item", () =>
  Effect.gen(function* watchOnce() {
    const { during, result, stdoutLines } = yield* watchUntilExit({
      args: ["watch", "--once"],
      whileWatching: ({ ann }) => mention(ann, "@bob once"),
    });
    const id = String(during);

    expect(result.exitCode).toBe(EXIT_SUCCESS);
    expect(stdoutLines).toStrictEqual([`#grill thread:${id} @ann: @bob once (msg ${id})`]);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("cookout watch --once --json exits 0 after printing the first new item as one JSON object", () =>
  Effect.gen(function* watchOnceJson() {
    const { during, result, stdoutLines } = yield* watchUntilExit({
      args: ["watch", "--once", "--json"],
      whileWatching: ({ ann }) => mention(ann, "@bob once"),
    });

    expect(result).toMatchObject({
      exitCode: EXIT_SUCCESS,
      stdoutJson: { item: { message: { id: during } }, type: "inbox-item" },
    });
    expect(stdoutLines).toHaveLength(ONE_LINE);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("cookout watch --timeout 1 exits 2 when no item arrives in time", () =>
  Effect.gen(function* watchTimeout() {
    const { result } = yield* watchUntilExit({ args: ["watch", "--timeout", "1"], whileWatching: () => Effect.void });

    expect(result).toMatchObject({ exitCode: EXIT_TIMEOUT, stdout: "" });
    expect(result.stderr).toContain('"timeout"');
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("cookout watch --until-mention skips an item that isn't a mention and exits 0 at the first mention", () =>
  Effect.gen(function* watchUntilMention() {
    const { during, result, stdoutLines } = yield* watchUntilExit({
      args: ["watch", "--until-mention", "--json"],
      prepare: ({ bob }) => Effect.asVoid(answer(() => bob.client.subscribe("grill"))),
      whileWatching: ({ ann }) => Effect.andThen(mention(ann, "no mention here"), mention(ann, "@bob now")),
    });

    expect(result).toMatchObject({ exitCode: EXIT_SUCCESS, stdoutJson: { item: { message: { id: during } } } });
    expect(stdoutLines).toHaveLength(ONE_LINE);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("cookout watch --until-mention exits 0 at a scheduled message that tags the watcher itself", () =>
  Effect.gen(function* watchScheduledSelfTag() {
    const text = "@bob standup";
    const { result } = yield* watchUntilExit({
      args: ["watch", "--until-mention", "--json"],
      prepare: ({ bob }) =>
        Effect.asVoid(
          answer(() =>
            bob.client.createScheduledMessage({ channel: "grill", cron: "0 9 * * *", text, timeZone: "UTC" }),
          ),
        ),
      whileWatching: () => TestClock.adjust("9 hours"),
    });

    expect(result).toMatchObject({ exitCode: EXIT_SUCCESS, stdoutJson: { item: { message: { text } } } });
  }).pipe(Effect.provide(commandLineServices)),
);

function twoOldMentions({ cookout }: Watch): Effect.Effect<void> {
  return Effect.gen(function* mentionBobTwice() {
    const cat = yield* cookout.createIdentity("cat");
    yield* answer(() => cat.client.createChannel({ name: "old" }));
    yield* answer(() => cat.client.createMessage({ channel: "old", text: "@bob one" }));
    yield* answer(() => cat.client.createMessage({ channel: "old", text: "@bob two" }));
  });
}

function twoOldPosts({ bob, cookout }: Watch): Effect.Effect<void> {
  return Effect.gen(function* postTwiceWhereBobSubscribes() {
    const cat = yield* cookout.createIdentity("cat");
    yield* answer(() => cat.client.createChannel({ name: "old" }));
    yield* answer(() => bob.client.subscribe("old"));
    yield* answer(() => cat.client.createMessage({ channel: "old", text: "one" }));
    yield* answer(() => cat.client.createMessage({ channel: "old", text: "two" }));
  });
}

it.effect.each(["--once", "--until-mention"])(
  "cookout watch %s with unread mentions waiting prints the unread line and exits 0",
  (flag) =>
    Effect.gen(function* watchStopsAtUnread() {
      const { result, stdoutLines } = yield* watchUntilExit({
        args: ["watch", flag],
        prepare: twoOldMentions,
        whileWatching: () => Effect.void,
      });

      expect(result.exitCode).toBe(EXIT_SUCCESS);
      expect(stdoutLines).toStrictEqual(["2 unread, run cookout inbox"]);
    }).pipe(Effect.provide(commandLineServices)),
);

it.effect("cookout watch starts with one line counting the unread items, then prints only newer items", () =>
  Effect.gen(function* watchUnread() {
    const { during, stdoutLines } = yield* watchUntilExit({
      args: ["watch", "--until-mention"],
      prepare: twoOldPosts,
      whileWatching: ({ ann }) => mention(ann, "@bob three"),
    });
    const id = String(during);

    expect(stdoutLines).toStrictEqual([
      "2 unread, run cookout inbox",
      `#grill thread:${id} @ann: @bob three (msg ${id})`,
    ]);
  }).pipe(Effect.provide(commandLineServices)),
);

function reconnectThenMention({ ann, link }: Watch): Effect.Effect<MessageId> {
  return Effect.gen(function* cutThenMention() {
    yield* link.cut;
    yield* Effect.raceFirst(link.relayed("event: connected", TWICE), passTime);
    return yield* mention(ann, "@bob after the drop");
  });
}

it.effect("cookout watch prints the unread line once, not again after a reconnect", () =>
  Effect.gen(function* watchUnreadOnce() {
    const { during, stdoutLines } = yield* watchUntilExit({
      args: ["watch", "--until-mention"],
      prepare: twoOldPosts,
      whileWatching: reconnectThenMention,
    });
    const id = String(during);

    expect(stdoutLines).toStrictEqual([
      "2 unread, run cookout inbox",
      `#grill thread:${id} @ann: @bob after the drop (msg ${id})`,
    ]);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("cookout watch stops with exit 1 and its refusal on stderr only, when the server refuses to open it", () =>
  Effect.gen(function* watchRefused() {
    const watch = yield* board;
    const human = yield* watch.cookout.createIdentity("cy", { kind: "human" });
    const env = { ...envOf(watch, watch.folder), CLAUDECODE: "1", COOKOUT_TOKEN: human.token };
    const result = yield* runCookout({ args: ["watch"], env });

    expect(result).toMatchObject({
      exitCode: EXIT_REFUSED,
      stderrJson: { error: { code: "agent_as_human" } },
      stdout: "",
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
