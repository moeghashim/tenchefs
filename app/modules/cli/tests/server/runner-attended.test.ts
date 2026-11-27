import { Array as Arr, Duration, Effect, Fiber, FileSystem, Option, Path, Predicate, Schema } from "effect";
import type { BoardAgent, CommandLineNeeds, StartedRunner, TestCookout, WakeBoard } from "../../../testing/server.ts";
import {
  WAKE_CHANNEL,
  answer,
  commandLineServices,
  joinWaking,
  runCookout,
  startRunner,
  testCookout,
  wakeBoard,
  wakeEvents,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { MessageId } from "../../../messages/index.ts";
import type { Presence } from "../../../sdk/index.ts";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";

interface Attended {
  readonly brigid: BoardAgent;
  readonly log: string;
  readonly on: WakeBoard;
  readonly release: Effect.Effect<void>;
  readonly runner: StartedRunner;
}

interface TakenBack {
  readonly back: Option.Option<Presence>;
  readonly lines: readonly unknown[];
}

interface HeldThroughRelease {
  readonly events: readonly (readonly [string, readonly number[]])[];
  readonly lines: readonly unknown[];
  readonly stillWatching: boolean;
}

type Needs = CommandLineNeeds | TestCookout | Scope.Scope;

const BRIGID = "brigid";
const CORMAC = "cormac";
const TICK = "5 seconds";
const PAUSE_MILLIS = 5;
const PAUSE = Duration.millis(PAUSE_MILLIS);
const FIRST_TICK = 1;
const ONE_LINE = 1;
const TWO_LINES = 2;
const THREE_LINES = 3;
const FOUR_LINES = 4;
const TICKS_WHILE_WATCHED = 30;
const EXIT_SUCCESS = 0;
const isLine = Schema.is(Schema.Struct({ agent: Schema.String, type: Schema.String }));
const isWakeRun = Schema.is(Schema.Struct({ messages: Schema.Array(Schema.Finite), type: Schema.String }));

const tick = Effect.andThen(TestClock.adjust(TICK), TestClock.withLive(Effect.sleep(PAUSE)));
const passTime = Effect.forever(tick);
const whileWatched = Effect.forEach(Arr.range(FIRST_TICK, TICKS_WHILE_WATCHED), () => tick, {
  concurrency: 1,
  discard: true,
});

function whilePassingTime<Value>(effect: Effect.Effect<Value>): Effect.Effect<Value> {
  return Effect.raceFirst(effect, Effect.andThen(passTime, Effect.never));
}

const brigidAndCormac: Effect.Effect<Attended, never, Needs> = Effect.gen(function* runnerForTwo() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const on = yield* wakeBoard;
  const log = path.join(on.folder, "wake.log");
  const release = path.join(on.folder, "release");
  const brigid = yield* joinWaking({ name: BRIGID, on, settings: { ack: true, log, waitFor: release } });
  yield* joinWaking({ name: CORMAC, on, settings: { log } });
  const runner = yield* startRunner({ COOKOUT_STATE_DIR: on.folder });
  return { brigid, log, on, release: Effect.orDie(fs.writeFileString(release, "go")), runner };
});

function mention(on: WakeBoard, text: string): Effect.Effect<MessageId> {
  return Effect.map(
    answer(() => on.ada.client.createMessage({ channel: WAKE_CHANNEL, text })),
    ({ message }) => message.id,
  );
}

function linesOf(runner: StartedRunner, count: number): Effect.Effect<readonly unknown[]> {
  return runner.stdoutLines(count);
}

function typesIn(lines: readonly unknown[]): readonly (readonly [string, string])[] {
  return Arr.map(Arr.filter(lines, isLine), ({ agent, type }) => [agent, type] as const);
}

function wakeEventsIn(
  log: string,
): Effect.Effect<readonly (readonly [string, readonly number[]])[], never, FileSystem.FileSystem> {
  return Effect.gen(function* eventsSoFar() {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* Effect.orDie(fs.exists(log));
    if (!exists) {
      return [];
    }
    return yield* wakeEvents(log);
  });
}

function wokeFor(id: MessageId): (line: unknown) => boolean {
  return (line) => isWakeRun(line) && line.type === "wake-run" && Arr.contains(line.messages, id);
}

function untilWokenFor(runner: StartedRunner, id: MessageId, count: number): Effect.Effect<void> {
  return Effect.flatMap(linesOf(runner, count), (lines) => {
    if (Arr.some(lines, wokeFor(id))) {
      return Effect.void;
    }
    return untilWokenFor(runner, id, lines.length + ONE_LINE);
  });
}

function anotherMention(
  attended: Attended,
): Effect.Effect<
  { readonly events: readonly (readonly [string, readonly number[]])[]; readonly next: MessageId },
  never,
  FileSystem.FileSystem
> {
  return Effect.gen(function* mentionAndWaitForItsRun() {
    const next = yield* mention(attended.on, "@brigid and this one");
    yield* untilWokenFor(attended.runner, next, FOUR_LINES);
    const events = yield* wakeEventsIn(attended.log);
    return { events, next };
  });
}

function terminalWatch(
  { brigid, runner }: Attended,
  args: readonly string[],
): Effect.Effect<Fiber.Fiber<{ readonly exitCode: number; readonly stdout: string }>, never, Needs> {
  return Effect.gen(function* takeBrigidBack() {
    const watching = yield* Effect.forkScoped(runCookout({ args: ["watch", ...args], env: brigid.env }));
    yield* linesOf(runner, ONE_LINE);
    return watching;
  });
}

function brigidPresence(on: WakeBoard): Effect.Effect<Option.Option<Presence>> {
  return Effect.map(
    answer(() => on.ada.client.presence()),
    ({ presence }) => Arr.findFirst(presence, ({ identity }) => identity === BRIGID),
  );
}

function untilTakenBack(attended: Attended): Effect.Effect<TakenBack> {
  return Effect.gen(function* linesThenWakingAgain() {
    yield* whilePassingTime(linesOf(attended.runner, TWO_LINES));
    const lines = yield* linesOf(attended.runner, THREE_LINES);
    const back = yield* whilePassingTime(
      Effect.repeat(brigidPresence(attended.on), {
        until: (presence) => Option.exists(presence, (shown) => "wakesOnMention" in shown),
      }),
    );
    return { back, lines };
  });
}

function heldThroughRelease(attended: Attended): Effect.Effect<HeldThroughRelease, never, Needs> {
  return Effect.gen(function* releaseWhileHeld() {
    const watching = yield* Effect.forkScoped(runCookout({ args: ["watch"], env: attended.brigid.env }));
    yield* linesOf(attended.runner, TWO_LINES);
    yield* attended.release;
    const lines = yield* linesOf(attended.runner, THREE_LINES);
    yield* whileWatched;
    const events = yield* wakeEventsIn(attended.log);
    const stillWatching = yield* Effect.sync(() => Predicate.isUndefined(watching.pollUnsafe()));
    return { events, lines, stillWatching };
  });
}

it.effect("a terminal watch replaces the runner's connection, and a mention then reaches it, not a wake run", () =>
  Effect.gen(function* terminalTakesBrigid() {
    const attended = yield* brigidAndCormac;
    const watching = yield* terminalWatch(attended, ["--until-mention"]);
    const id = yield* mention(attended.on, "@brigid in the terminal now?");
    const watched = yield* Fiber.join(watching);
    const events = yield* wakeEventsIn(attended.log);
    const lines = yield* linesOf(attended.runner, ONE_LINE);

    expect(typesIn(lines)).toStrictEqual([[BRIGID, "watch-replaced"]]);
    expect(watched.exitCode).toBe(EXIT_SUCCESS);
    expect(watched.stdout).toContain(`(msg ${String(id)})`);
    expect(events).toStrictEqual([]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("the runner opens no new connection while the terminal watch is live", () =>
  Effect.gen(function* noTakingTurns() {
    const attended = yield* brigidAndCormac;
    const watching = yield* terminalWatch(attended, []);
    yield* whileWatched;
    const stillWatching = yield* Effect.sync(() => Predicate.isUndefined(watching.pollUnsafe()));
    const presence = yield* brigidPresence(attended.on);
    const lines = yield* linesOf(attended.runner, ONE_LINE);

    expect(stillWatching).toBe(true);
    expect(Option.map(presence, (shown) => [shown.online, "wakesOnMention" in shown])).toStrictEqual(
      Option.some([true, false]),
    );
    expect(typesIn(lines)).toStrictEqual([[BRIGID, "watch-replaced"]]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("once the terminal watch closes and the agent is offline, a mention left unread wakes it once", () =>
  Effect.gen(function* runnerTakesBrigidBack() {
    const attended = yield* brigidAndCormac;
    const watching = yield* terminalWatch(attended, ["--until-mention"]);
    const id = yield* mention(attended.on, "@brigid answer this later");
    yield* Fiber.join(watching);
    yield* attended.release;
    const { back, lines } = yield* untilTakenBack(attended);
    const { events, next } = yield* anotherMention(attended);

    expect(typesIn(lines)).toStrictEqual([
      [BRIGID, "watch-replaced"],
      [BRIGID, "reconnected"],
      [BRIGID, "wake-run"],
    ]);
    expect(Option.isSome(back)).toBe(true);
    expect(events).toStrictEqual([
      ["start", [id]],
      ["end", [id]],
      ["start", [next]],
      ["end", [next]],
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a mention waiting behind a wake run doesn't start while the terminal holds the agent", () =>
  Effect.gen(function* waitingRunDropped() {
    const attended = yield* brigidAndCormac;
    const [first, second] = yield* Effect.forEach(
      ["@brigid one", "@brigid two"],
      (text) => mention(attended.on, text),
      {
        concurrency: 1,
      },
    );
    const waiting = yield* linesOf(attended.runner, ONE_LINE);
    const { events, lines, stillWatching } = yield* heldThroughRelease(attended);

    expect(typesIn(waiting)).toStrictEqual([[BRIGID, "mention-waiting"]]);
    expect(Arr.drop(typesIn(lines), ONE_LINE)).toStrictEqual([
      [BRIGID, "watch-replaced"],
      [BRIGID, "wake-run"],
    ]);
    expect(stillWatching).toBe(true);
    expect(events).toStrictEqual([
      ["start", [first]],
      ["end", [first]],
    ]);
    expect(events).not.toContainEqual(["start", [second]]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("another registered agent is woken as normal while the first is held by a terminal", () =>
  Effect.gen(function* cormacCarriesOn() {
    const attended = yield* brigidAndCormac;
    yield* terminalWatch(attended, []);
    const id = yield* mention(attended.on, "@cormac still there?");
    const lines = yield* linesOf(attended.runner, TWO_LINES);
    const events = yield* wakeEventsIn(attended.log);

    expect(typesIn(lines)).toStrictEqual([
      [BRIGID, "watch-replaced"],
      [CORMAC, "wake-run"],
    ]);
    expect(Arr.filter(events, ([, messages]) => Arr.contains(messages, id))).toStrictEqual([
      ["start", [id]],
      ["end", [id]],
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
