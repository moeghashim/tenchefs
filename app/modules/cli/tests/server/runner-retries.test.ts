import type { CommandLineNeeds, CuttableLink, StartedRunner, TestCookout, WakeBoard } from "../../../testing/server.ts";
import { Effect, Path, String as Str } from "effect";
import {
  commandLineServices,
  cuttableLink,
  joinWaking,
  mention,
  runCookout,
  startRunner,
  testCookout,
  wakeBoard,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { MessageId } from "../../../messages/index.ts";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import { inboxPath } from "../../../inbox/index.ts";

type Needs = CommandLineNeeds | TestCookout | Scope.Scope;
type Ran = Effect.Success<ReturnType<typeof runCookout>>;

interface DownBoard {
  readonly down: MessageId;
  readonly link: CuttableLink;
  readonly on: WakeBoard;
}

const A_WHILE = "5 seconds";
const THREE_REFUSALS = 3;
const A_LONG_OUTAGE = 1000;
const TWO_REFUSALS = 2;
const ONE_LINE = 1;
const SOME_TEXT: unknown = expect.any(String);

const passTime = Effect.forever(Effect.andThen(TestClock.adjust(A_WHILE), Effect.yieldNow));

function brigidBehindALink(refusals: number): Effect.Effect<DownBoard, never, Needs> {
  return Effect.gen(function* joinBrigidThroughALink() {
    const path = yield* Path.Path;
    const board = yield* wakeBoard;
    const link = yield* cuttableLink(board.url);
    const on = { ...board, url: link.url };
    yield* joinWaking({ name: "brigid", on, settings: { log: path.join(on.folder, "wake.log") } });
    const down = yield* mention({ ada: on.ada, text: "@brigid posted while you were down" });
    yield* link.badGatewayFor(refusals, inboxPath);
    return { down, link, on };
  });
}

function startedThroughOutage({ link, on }: DownBoard): Effect.Effect<StartedRunner, never, Needs> {
  return Effect.gen(function* startRunnerThroughOutage() {
    const runner = yield* startRunner({ COOKOUT_STATE_DIR: on.folder });
    yield* Effect.raceFirst(link.relayed("posted while you were down"), passTime);
    return runner;
  });
}

function statusAsJson(on: WakeBoard): Effect.Effect<Ran, never, Needs> {
  return runCookout({ args: ["runner", "status", "--json"], env: { COOKOUT_STATE_DIR: on.folder } });
}

function isRetrying({ stdout }: Ran): boolean {
  return Str.includes('"retrying"')(stdout);
}

it.effect("an agent whose catch-up the board refuses a few times reconnects by itself and is woken for it", () =>
  Effect.gen(function* reconnectsAndCatchesUp() {
    const down = yield* brigidBehindALink(THREE_REFUSALS);
    const runner = yield* startedThroughOutage(down);
    const lines = yield* runner.stdoutLines(ONE_LINE);
    const errors = yield* runner.stderrLines(ONE_LINE);

    expect(lines).toMatchObject([{ agent: "brigid", messages: [down.down], type: "wake-run" }]);
    expect(errors).not.toContainEqual(expect.objectContaining({ agent: "brigid", error: SOME_TEXT }));
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("runner status shows an agent the board keeps refusing as retrying, with the last error", () =>
  Effect.gen(function* statusWhileRetrying() {
    const down = yield* brigidBehindALink(A_LONG_OUTAGE);
    yield* startRunner({ COOKOUT_STATE_DIR: down.on.folder });
    yield* Effect.raceFirst(down.link.answeredBadGateway(TWO_REFUSALS), passTime);
    const json = yield* Effect.raceFirst(
      Effect.repeat(statusAsJson(down.on), { until: isRetrying }),
      Effect.andThen(passTime, Effect.never),
    );
    const text = yield* runCookout({ args: ["runner", "status"], env: { COOKOUT_STATE_DIR: down.on.folder } });

    expect(json).toMatchObject({
      stdoutJson: {
        registrations: [{ agent: "brigid", error: { code: SOME_TEXT, message: SOME_TEXT }, state: "retrying" }],
      },
    });
    expect(text.stdout).toMatch(/^brigid +retrying after \S+: .+ +\S+$/u);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
