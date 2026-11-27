import { Array as Arr, Effect, Option } from "effect";
import type { Presence, WakeRunFailure } from "../../../presence/index.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const NOT_FOUND = { code: "not_found", status: 404 } as const;

it.effect("a wake run can't start or end without a live connection opened as a runner", () =>
  Effect.gen(function* noRunner() {
    const cookout = yield* TestCookout;
    const agent = yield* cookout.createIdentity("brigid");
    yield* Effect.acquireRelease(
      answer(() => agent.client.watch()),
      (events) => answer(() => events.close()),
    );
    const started = yield* refusal(() => agent.client.startWakeRun());
    const ended = yield* refusal(() => agent.client.endWakeRun());

    expect(started).toMatchObject(NOT_FOUND);
    expect(ended).toMatchObject(NOT_FOUND);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a runner's wake run starts and ends, answering whether one is in progress", () =>
  Effect.gen(function* runnerSays() {
    const cookout = yield* TestCookout;
    const agent = yield* cookout.createIdentity("brigid");
    yield* Effect.acquireRelease(
      answer(() => agent.client.watch({ runner: true })),
      (events) => answer(() => events.close()),
    );
    const started = yield* answer(() => agent.client.startWakeRun());
    const ended = yield* answer(() => agent.client.endWakeRun());

    expect([started, ended]).toStrictEqual([{ wakeRun: true }, { wakeRun: false }]);
  }).pipe(Effect.provide(testCookout())),
);

const runnerOfAda = Effect.gen(function* brigidHeldByRunner() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", { kind: "human" });
  const agent = yield* cookout.createIdentity("brigid", { owner: "ada" });
  yield* Effect.acquireRelease(
    answer(() => agent.client.watch({ runner: true })),
    (events) => answer(() => events.close()),
  );
  const brigidNow = Effect.map(
    answer(() => ada.client.presence()),
    ({ presence }) => Arr.findFirst(presence, ({ identity }) => identity === "brigid"),
  );
  const alerts = Effect.map(
    answer(() => ada.client.inbox()),
    (inbox) =>
      Arr.map(inbox.alerts, ({ backOnlineAt, offlineReason }) => ({ back: typeof backOnlineAt, offlineReason })),
  );
  function failing(failure: WakeRunFailure): Effect.Effect<Option.Option<Presence>> {
    return Effect.andThen(
      answer(() => agent.client.startWakeRun()),
      Effect.andThen(
        answer(() => agent.client.failWakeRun(failure)),
        brigidNow,
      ),
    );
  }
  const ending = Effect.andThen(
    answer(() => agent.client.startWakeRun()),
    Effect.andThen(
      answer(() => agent.client.endWakeRun()),
      brigidNow,
    ),
  );
  return { agent, alerts, brigidNow, ending, failing };
});

it.effect("a failed wake run makes its agent Unreachable with how it failed", () =>
  Effect.gen(function* failedRun() {
    const { agent, brigidNow } = yield* runnerOfAda;
    yield* answer(() => agent.client.startWakeRun());
    const failed = yield* answer(() => agent.client.failWakeRun({ exitCode: 3 }));
    const exited = yield* brigidNow;

    expect(failed).toStrictEqual({ wakeRun: false });
    expect(exited).toMatchObject(
      Option.some({
        identity: "brigid",
        online: false,
        unreachable: { error: "wake run exited 3", ok: false },
        warning: true,
      }),
    );
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent stays Unreachable through a retry until a wake run ends 0", () =>
  Effect.gen(function* failThenSucceed() {
    const runner = yield* runnerOfAda;
    yield* runner.failing({ exitCode: 3 });
    const retrying = yield* Effect.andThen(
      answer(() => runner.agent.client.startWakeRun()),
      runner.brigidNow,
    );
    const timedOut = yield* runner.failing({ timedOutAfterMinutes: 10 });
    const back = yield* runner.ending;

    expect(retrying).toMatchObject(Option.some({ online: false, unreachable: { error: "wake run exited 3" } }));
    expect(timedOut).toMatchObject(
      Option.some({ online: false, unreachable: { error: "wake run timed out after 10 min" } }),
    );
    expect(back).toMatchObject(Option.some({ online: true, wakesOnMention: true }));
    expect(Option.getOrThrow(back)).not.toHaveProperty("unreachable");
  }).pipe(Effect.provide(testCookout())),
);

it.effect("two failed wake runs in a row raise one offline alert, and the next run ending 0 clears it", () =>
  Effect.gen(function* oneAlertPerStreak() {
    const runner = yield* runnerOfAda;
    yield* Effect.all([runner.failing({ exitCode: 1 }), runner.failing({ exitCode: 2 })], { concurrency: 1 });
    const streak = yield* runner.alerts;
    yield* runner.ending;
    const cleared = yield* runner.alerts;
    yield* runner.failing({ exitCode: 1 });
    const again = yield* runner.alerts;

    expect(streak).toStrictEqual([{ back: "undefined", offlineReason: "wake run failed" }]);
    expect(cleared).toStrictEqual([{ back: "string", offlineReason: "wake run failed" }]);
    expect(again).toStrictEqual([
      { back: "string", offlineReason: "wake run failed" },
      { back: "undefined", offlineReason: "wake run failed" },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a wake run failure is refused without a runner, and with a body that isn't a failure", () =>
  Effect.gen(function* refusedFailures() {
    const cookout = yield* TestCookout;
    const agent = yield* cookout.createIdentity("brigid");
    const noRunner = yield* refusal(() => agent.client.failWakeRun({ exitCode: 3 }));
    yield* Effect.acquireRelease(
      answer(() => agent.client.watch({ runner: true })),
      (events) => answer(() => events.close()),
    );
    const zero = yield* refusal(() => agent.client.failWakeRun({ exitCode: 0 }));

    expect(noRunner).toMatchObject(NOT_FOUND);
    expect(zero).toMatchObject({ status: 400 });
  }).pipe(Effect.provide(testCookout())),
);
