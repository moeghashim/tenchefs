import type { RedV1State, V1Run } from "../lib/red-v1.ts";
import { expect, it } from "vitest";
import { DateTime } from "effect";
import { redV1Decision } from "../lib/red-v1.ts";

const MINUTE_MS = 60_000;
const RED_AT = "2026-11-25T12:00:00Z";
const RED_AT_MS = DateTime.toEpochMillis(DateTime.makeUnsafe(RED_AT));
const TWENTY_NINE = 29;
const THIRTY = 30;
const ISSUE = 900;
const FIRST = 1;
const RERUN = 2;
const GREEN_RUN = 1;
const RED_RUN = 2;
const NEWER_RUN = 3;

const GREEN_SHA = "aaaa0000aaaa0000";
const RED_SHA = "bbbb1111bbbb1111";
const NEWER_SHA = "cccc2222cccc2222";

function run(sha: string, number: number, overrides: Partial<V1Run> = {}): V1Run {
  return {
    attempt: FIRST,
    conclusion: "success",
    run: number,
    sha,
    status: "completed",
    updatedAt: RED_AT,
    url: `https://github.com/o/r/actions/runs/${String(number)}`,
    ...overrides,
  };
}

const GREEN = run(GREEN_SHA, GREEN_RUN);
const FAILED_ONCE = run(RED_SHA, RED_RUN, { conclusion: "failure" });
const RED = run(RED_SHA, RED_RUN, { attempt: RERUN, conclusion: "failure" });

function state(overrides: Partial<RedV1State>): RedV1State {
  return {
    commits: [RED_SHA, GREEN_SHA],
    issue: null,
    nowMillis: RED_AT_MS,
    reverted: [],
    runs: [GREEN],
    ...overrides,
  };
}

function minutesAfterRed(minutes: number): number {
  return RED_AT_MS + minutes * MINUTE_MS;
}

function kinds(given: RedV1State): readonly string[] {
  return redV1Decision(given).actions.map((action) => action.kind);
}

const AT_THIRTY = minutesAfterRed(THIRTY);

it("reruns a red run's failed jobs once before judging it", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(redV1Decision(state({ runs: [FAILED_ONCE, GREEN] })).actions).toStrictEqual([
    { kind: "rerun", run: FAILED_ONCE },
  ]);
});

it("a red run that passes on its rerun opens nothing", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const passed = run(RED_SHA, RED_RUN, { attempt: RERUN });

  expect(kinds(state({ runs: [passed, GREEN] }))).toStrictEqual([]);
});

it("a rerun still running is waited for", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const rerunning = run(RED_SHA, RED_RUN, { attempt: RERUN, conclusion: "", status: "in_progress" });

  expect(kinds(state({ runs: [rerunning, GREEN] }))).toStrictEqual([]);
});

it("a red rerun opens one fix-forward issue naming the first red commit", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(redV1Decision(state({ runs: [RED, GREEN] })).actions).toStrictEqual([
    { firstRed: RED_SHA, kind: "open", newestGreen: GREEN, redRun: RED, since: [RED_SHA] },
  ]);
});

it("the first red commit is the oldest red one after the newest green", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const newerRed = run(NEWER_SHA, NEWER_RUN, { attempt: RERUN, conclusion: "failure" });
  const decided = redV1Decision(state({ commits: [NEWER_SHA, RED_SHA, GREEN_SHA], runs: [newerRed, RED, GREEN] }));

  expect(decided.actions).toStrictEqual([
    { firstRed: RED_SHA, kind: "open", newestGreen: GREEN, redRun: RED, since: [NEWER_SHA, RED_SHA] },
  ]);
});

it("a second red run on a newer commit opens no second issue", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const newerRed = run(NEWER_SHA, NEWER_RUN, { attempt: RERUN, conclusion: "failure" });
  const issue = { firstRed: RED_SHA, number: ISSUE };

  expect(kinds(state({ commits: [NEWER_SHA, RED_SHA, GREEN_SHA], issue, runs: [newerRed, RED, GREEN] }))).toStrictEqual(
    [],
  );
});

it("a green run after the red one closes the issue", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const fixed = run(NEWER_SHA, NEWER_RUN);
  const issue = { firstRed: RED_SHA, number: ISSUE };

  expect(
    redV1Decision(state({ commits: [NEWER_SHA, RED_SHA, GREEN_SHA], issue, runs: [fixed, RED, GREEN] })).actions,
  ).toStrictEqual([{ green: fixed, issue: ISSUE, kind: "close" }]);
});

it("a cancelled run is no verdict, red or green", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const cancelled = run(NEWER_SHA, NEWER_RUN, { conclusion: "cancelled" });
  const issue = { firstRed: RED_SHA, number: ISSUE };

  expect(
    kinds(state({ commits: [NEWER_SHA, RED_SHA, GREEN_SHA], issue, runs: [cancelled, RED, GREEN] })),
  ).toStrictEqual([]);
});

it("at 29 minutes after the red run nothing is reverted, and it decides again at 30", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const issue = { firstRed: RED_SHA, number: ISSUE };
  const decided = redV1Decision(state({ issue, nowMillis: minutesAfterRed(TWENTY_NINE), runs: [RED, GREEN] }));

  expect(decided).toStrictEqual({
    actions: [],
    lines: [`waits: ${RED_SHA} has been red since ${RED_AT}; it is reverted at 2026-11-25T12:30:00.000Z`],
    retryAtMillis: minutesAfterRed(THIRTY),
  });
});

it("at 30 minutes with no green the first red commit is reverted", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const issue = { firstRed: RED_SHA, number: ISSUE };

  expect(redV1Decision(state({ issue, nowMillis: AT_THIRTY, runs: [RED, GREEN] })).actions).toStrictEqual([
    { issue: ISSUE, kind: "revert", sha: RED_SHA },
  ]);
});

it("opens the issue and reverts in one go when the issue is missing at 30 minutes", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(kinds(state({ nowMillis: AT_THIRTY, runs: [RED, GREEN] }))).toStrictEqual(["open", "revert"]);
});

it("never reverts the same commit twice", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const issue = { firstRed: RED_SHA, number: ISSUE };
  const decided = redV1Decision(state({ issue, nowMillis: AT_THIRTY, reverted: [RED_SHA], runs: [RED, GREEN] }));

  expect(decided).toStrictEqual({ actions: [], lines: [`skipped: ${RED_SHA} was reverted already`] });
});

it("a Check run still running on a newer commit defers the revert", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const running = run(NEWER_SHA, NEWER_RUN, { conclusion: "", status: "in_progress" });
  const issue = { firstRed: RED_SHA, number: ISSUE };
  const decided = redV1Decision(
    state({
      commits: [NEWER_SHA, RED_SHA, GREEN_SHA],
      issue,
      nowMillis: AT_THIRTY,
      runs: [running, RED, GREEN],
    }),
  );

  expect(decided).toStrictEqual({
    actions: [],
    lines: [`waits: Check run 3 on the newer commit ${NEWER_SHA} is still running: ${running.url}`],
  });
});

it("a newer red run waiting for its rerun defers the revert too", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const failedOnce = run(NEWER_SHA, NEWER_RUN, { conclusion: "failure" });
  const issue = { firstRed: RED_SHA, number: ISSUE };

  expect(
    kinds(
      state({
        commits: [NEWER_SHA, RED_SHA, GREEN_SHA],
        issue,
        nowMillis: AT_THIRTY,
        runs: [failedOnce, RED, GREEN],
      }),
    ),
  ).toStrictEqual(["rerun"]);
});

it("with no green run in sight the oldest red commit is still the first red one", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(redV1Decision(state({ commits: [RED_SHA], runs: [RED] })).actions).toStrictEqual([
    { firstRed: RED_SHA, kind: "open", newestGreen: null, redRun: RED, since: [RED_SHA] },
  ]);
});

it("an open issue on a green v1 closes even when its commit is out of sight", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(kinds(state({ commits: [GREEN_SHA], issue: { firstRed: RED_SHA, number: ISSUE } }))).toStrictEqual(["close"]);
});

it("a new run on the red commit keeps it red and the issue open", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const again = run(RED_SHA, NEWER_RUN, { conclusion: "", status: "in_progress" });
  const issue = { firstRed: RED_SHA, number: ISSUE };

  expect(kinds(state({ issue, runs: [again, RED, GREEN] }))).toStrictEqual([]);
});

it("an issue whose red commit is waiting on its rerun stays open", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const issue = { firstRed: RED_SHA, number: ISSUE };

  expect(kinds(state({ issue, runs: [FAILED_ONCE, GREEN] }))).toStrictEqual(["rerun"]);
});
