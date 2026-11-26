import type { CommandLineNeeds, TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { Effect, Fiber, Layer } from "effect";
import {
  TestCookout,
  answer,
  commandLineServices,
  cuttableLink,
  freshStateFolder,
  runCookout,
  testCookout,
  watchCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Message } from "../../../messages/index.ts";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import { inboxPath } from "../../../inbox/index.ts";

interface Board {
  readonly cookout: TestCookoutService;
  readonly bob: TestIdentity;
  readonly env: Readonly<Record<string, string>>;
  readonly thread: Message;
}

const ONE_LINE = 1;
const EXIT_SUCCESS = 0;
const SETTLE = "30 millis";
const ALMOST_THREE_DAYS = "259199 seconds";
const LAST_SECOND = "1 second";
const NUDGE_TEXT = "Quiet for 3 days: close it, or follow up?";
const SLOW_START_UP_COUNT_MILLIS = 200;

const services = Layer.merge(testCookout(), commandLineServices);

const settled: Effect.Effect<void> = TestClock.withLive(Effect.sleep(SETTLE));

const bobStartsAThread: Effect.Effect<Board, never, TestCookout | CommandLineNeeds | Scope.Scope> = Effect.gen(
  function* bobStarts() {
    const cookout = yield* TestCookout;
    const bob = yield* cookout.createIdentity("bob");
    const folder = yield* freshStateFolder;
    yield* answer(() => bob.client.createChannel({ name: "grill" }));
    const { message } = yield* answer(() => bob.client.createMessage({ channel: "grill", text: "who owns this?" }));
    const env = { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: bob.token, COOKOUT_URL: cookout.url };
    yield* Effect.andThen(settled, TestClock.adjust(ALMOST_THREE_DAYS));
    return { bob, cookout, env, thread: message };
  },
);

const lastQuietSecond: Effect.Effect<void> = Effect.andThen(
  Effect.andThen(settled, TestClock.adjust(LAST_SECOND)),
  settled,
);

it.effect("cookout inbox prints the caller's unread nudges", () =>
  Effect.gen(function* inboxNudges() {
    const { env, thread } = yield* bobStartsAThread;
    yield* lastQuietSecond;
    const result = yield* runCookout({ args: ["inbox"], env });

    expect(result).toMatchObject({
      exitCode: EXIT_SUCCESS,
      stdoutJson: { items: [], nudges: [{ kind: "first", parent: { id: thread.id }, text: NUDGE_TEXT }] },
    });
  }).pipe(Effect.provide(services)),
);

it.effect("cookout watch prints a line for a nudge as it is raised", () =>
  Effect.gen(function* watchNudge() {
    const { env, thread } = yield* bobStartsAThread;
    const { stdoutLines } = yield* watchCookout({
      args: ["watch"],
      env,
      lines: ONE_LINE,
      whileWatching: lastQuietSecond,
    });

    expect(stdoutLines).toStrictEqual([`#grill thread:${String(thread.id)} ${NUDGE_TEXT} (nudge 1)`]);
  }).pipe(Effect.provide(services)),
);

it.effect("cookout watch says it is watching only once it has read its start-up unread count", () =>
  Effect.gen(function* watchCountsBeforeSaying() {
    const { cookout, env, thread } = yield* bobStartsAThread;
    const link = yield* cuttableLink(cookout.url);
    yield* link.delayNext(inboxPath, SLOW_START_UP_COUNT_MILLIS);
    const { stdoutLines } = yield* watchCookout({
      args: ["watch"],
      env: { ...env, COOKOUT_URL: link.url },
      lines: ONE_LINE,
      whileWatching: lastQuietSecond,
    });

    expect(stdoutLines).toStrictEqual([`#grill thread:${String(thread.id)} ${NUDGE_TEXT} (nudge 1)`]);
  }).pipe(Effect.provide(services)),
);

it.effect("cookout watch --until-mention exits 0 at a nudge raised while it watches", () =>
  Effect.gen(function* untilMentionLive() {
    const { env } = yield* bobStartsAThread;
    const watching = yield* Effect.forkScoped(runCookout({ args: ["watch", "--until-mention", "--json"], env }));
    yield* Effect.andThen(settled, lastQuietSecond);
    const result = yield* Fiber.join(watching);

    expect(result).toMatchObject({ exitCode: EXIT_SUCCESS, stdoutJson: { nudge: { kind: "first" }, type: "nudge" } });
  }).pipe(Effect.provide(services)),
);

it.effect("cookout watch --until-mention exits 0 at start-up when an unread nudge is waiting", () =>
  Effect.gen(function* untilMentionAtStart() {
    const { env } = yield* bobStartsAThread;
    yield* lastQuietSecond;
    const result = yield* runCookout({ args: ["watch", "--until-mention"], env });

    expect(result).toMatchObject({ exitCode: EXIT_SUCCESS, stdout: "1 unread, run cookout inbox" });
  }).pipe(Effect.provide(services)),
);
