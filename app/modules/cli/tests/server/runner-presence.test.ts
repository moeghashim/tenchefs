import { Array as Arr, Effect, FileSystem, Option, Path, Schema } from "effect";
import type { CommandLineNeeds, StartedRunner, TestCookoutService, WakeBoard } from "../../../testing/server.ts";
import type { CookoutEvent, Presence } from "../../../sdk/index.ts";
import {
  TestCookout,
  agentSessionTokenIn,
  answer,
  boardAgent,
  commandLineServices,
  joinWaking,
  runCookout,
  startRunner,
  testCookout,
  wakeBoard,
  watchingAllChannels,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";

type Feed = AsyncIterator<CookoutEvent, unknown>;

interface Waking {
  readonly cookout: TestCookoutService;
  readonly feed: Feed;
  readonly on: WakeBoard;
  readonly release: Effect.Effect<void>;
  readonly runner: StartedRunner;
}

type Needs = CommandLineNeeds | TestCookout | Scope.Scope;

const AGENT = "brigid";
const ONE_RUN = 1;
const encode = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

function presenceOf(next: Readonly<IteratorResult<CookoutEvent, unknown>>): Option.Option<Presence> {
  if (next.done === true || next.value.type !== "presence" || next.value.presence.identity !== AGENT) {
    return Option.none();
  }
  return Option.some(next.value.presence);
}

function nextPresence({ feed }: Pick<Waking, "feed">): Effect.Effect<Presence> {
  return answer(() => feed.next()).pipe(
    Effect.map(presenceOf),
    Effect.repeat({ until: Option.isSome }),
    Effect.map(Option.getOrThrow),
  );
}

const runnerWaking: Effect.Effect<Waking, never, Needs> = Effect.gen(function* startRunnerForBrigid() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const cookout = yield* TestCookout;
  const on = yield* wakeBoard;
  const feed = yield* watchingAllChannels(on.ada);
  const release = path.join(on.folder, "release");
  yield* joinWaking({
    name: AGENT,
    on,
    settings: { ack: true, log: path.join(on.folder, "wake.log"), waitFor: release },
  });
  const runner = yield* startRunner({ COOKOUT_STATE_DIR: on.folder });
  return { cookout, feed, on, release: Effect.orDie(fs.writeFileString(release, "go")), runner };
});

function mentionBrigid(on: WakeBoard): Effect.Effect<void> {
  return Effect.asVoid(answer(() => on.ada.client.createMessage({ channel: "grill", text: "@brigid wake up" })));
}

function presenceNow(on: WakeBoard): Effect.Effect<Option.Option<Presence>> {
  return Effect.map(
    answer(() => on.ada.client.presence()),
    ({ presence }) => Arr.findFirst(presence, ({ identity }) => identity === AGENT),
  );
}

function throughOneRun(waking: Waking): Effect.Effect<readonly Presence[]> {
  return Effect.gen(function* asleepRunningAsleep() {
    const asleep = yield* nextPresence(waking);
    yield* mentionBrigid(waking.on);
    const running = yield* nextPresence(waking);
    const listed = yield* presenceNow(waking.on);
    yield* waking.release;
    const ended = yield* nextPresence(waking);
    return [asleep, running, ...Option.toArray(listed), ended];
  });
}

it.effect("a sleeping runner shows its agent online, waking on mention, in the stream and GET /v1/presence", () =>
  Effect.gen(function* runnerConnects() {
    const waking = yield* runnerWaking;
    const streamed = yield* nextPresence(waking);
    const listed = yield* presenceNow(waking.on);

    expect(waking.runner.firstStderr).toStrictEqual({ waking: [AGENT] });
    expect(streamed).toMatchObject({ connection: { via: "watch" }, online: true, wakesOnMention: true });
    expect(listed).toStrictEqual(Option.some(streamed));
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a wake run in progress shows plain online, and its end shows waking on mention again", () =>
  Effect.gen(function* wakeRunStartsAndEnds() {
    const waking = yield* runnerWaking;
    const [, running, listed, ended] = yield* throughOneRun(waking);
    const lines = yield* waking.runner.stdoutLines(ONE_RUN);

    expect(running).toStrictEqual({ connection: { via: "watch" }, identity: AGENT, online: true });
    expect(listed).toStrictEqual(running);
    expect(ended).toMatchObject({ online: true, wakesOnMention: true });
    expect(lines).toMatchObject([{ agent: AGENT, exitCode: 0, type: "wake-run" }]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a stopped runner leaves its agent offline after the grace, with when it was last seen", () =>
  Effect.gen(function* runnerStops() {
    const waking = yield* runnerWaking;
    yield* nextPresence(waking);
    yield* waking.runner.stop;
    yield* waking.cookout.liveConnectionsClosed(AGENT);
    const inGrace = yield* presenceNow(waking.on);
    yield* TestClock.adjust("60 seconds");
    const gone = yield* presenceNow(waking.on);

    expect(inGrace).toStrictEqual(Option.some({ connection: { via: "watch" }, identity: AGENT, online: true }));
    expect(Option.map(gone, ({ lastSeenAt, ...rest }) => [typeof lastSeenAt, rest])).toStrictEqual(
      Option.some(["string", { identity: AGENT, online: false }]),
    );
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a plain cookout watch for the agent shows online with its connection and no waking on mention", () =>
  Effect.gen(function* plainWatch() {
    const on = yield* wakeBoard;
    const feed = yield* watchingAllChannels(on.ada);
    const joined = yield* boardAgent({ board: on, name: AGENT });
    yield* runCookout({ args: ["join", "--as", AGENT], env: joined.env });
    yield* Effect.forkScoped(runCookout({ args: ["watch"], env: joined.env }));
    const watching = yield* nextPresence({ feed });

    expect(watching).toStrictEqual({ connection: { via: "watch" }, identity: AGENT, online: true });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("no token appears in the presence the runner's states stream or list", () =>
  Effect.gen(function* noTokens() {
    const waking = yield* runnerWaking;
    const seen = yield* throughOneRun(waking);
    const listed = yield* answer(() => waking.on.ada.client.presence());
    const token = yield* agentSessionTokenIn(waking.on.folder);
    const everything = yield* Effect.orDie(encode([seen, listed]));

    expect(Option.isSome(token)).toBe(true);
    expect(everything).not.toContain(Option.getOrElse(token, () => "no token"));
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
