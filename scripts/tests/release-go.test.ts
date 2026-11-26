import { expect, it } from "vitest";
import { DateTime } from "effect";
import type { Outcome } from "../lib/tools.ts";
import { releaseGo } from "../lib/release-go.ts";

const SHA = "aaaa1111bbbb2222";
const TAG = "deploy/cccc3333";
const NOW_MS = DateTime.toEpochMillis(DateTime.makeUnsafe("2026-11-25T12:00:00Z"));
const THIS_RUN = "900";
const MINUTE_MS = 60_000;
const JUST_NOW = 0;
const A_MINUTE = 1;
const FIVE_MINUTES = 5;
const TEN_MINUTES = 10;
const TWENTY_MINUTES = 20;
const THIRTY_ONE_MINUTES = 31;

interface GateRun {
  readonly minutesAgo: number;
  readonly ranTheGate: boolean;
  readonly run: string;
}

interface History {
  readonly ahead: string;
  readonly changed: readonly string[];
  readonly event: string;
  readonly runs: readonly GateRun[];
  readonly tag: string;
}

const BEHIND = "0";
const AHEAD = "1";
const HISTORY: History = { ahead: AHEAD, changed: ["app/main.ts"], event: "schedule", runs: [], tag: TAG };

function startedAt(minutesAgo: number): string {
  return DateTime.formatIso(DateTime.makeUnsafe(NOW_MS - minutesAgo * MINUTE_MS));
}

const NO_RUN: GateRun = { minutesAgo: JUST_NOW, ranTheGate: false, run: "" };

function conclusionOf({ ranTheGate }: GateRun): string {
  if (ranTheGate) {
    return "success";
  }
  return "skipped";
}

function jobsOf(run: GateRun): string {
  const gate = conclusionOf(run);
  return JSON.stringify({
    jobs: [
      { conclusion: "success", name: "choose the commit" },
      { conclusion: gate, name: "browser 1/3" },
      { conclusion: "success", name: "the gate" },
    ],
  });
}

function gitOf({ ahead, changed, tag }: History): (args: readonly string[]) => Outcome<string> {
  return (args) => {
    if (args.includes("for-each-ref")) {
      return { ok: true, value: `${tag}\n` };
    }
    if (args.includes("rev-list")) {
      return { ok: true, value: `${ahead}\n` };
    }
    return { ok: true, value: `${changed.join("\n")}\n` };
  };
}

function decided(overrides: Partial<History>): ReturnType<typeof releaseGo> {
  const history = { ...HISTORY, ...overrides };
  const listed = [
    { databaseId: Number(THIS_RUN), startedAt: startedAt(JUST_NOW) },
    ...history.runs.map(({ minutesAgo, run }) => ({ databaseId: Number(run), startedAt: startedAt(minutesAgo) })),
  ];
  return releaseGo({
    asked: { event: history.event, nowMillis: NOW_MS, sha: SHA, thisRun: THIS_RUN },
    gh: (args): Outcome<string> => {
      if (args.includes("list")) {
        return { ok: true, value: JSON.stringify(listed) };
      }
      return { ok: true, value: jobsOf(history.runs.find(({ run }) => args.includes(run)) ?? NO_RUN) };
    },
    git: gitOf(history),
  });
}

it("skips a commit that is already deployed", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(decided({ ahead: BEHIND })).toStrictEqual({
    ok: true,
    value: { go: false, line: `skipped: ${SHA} is already deployed (at or behind ${TAG})`, promote: false },
  });
});

it.each([["app/modules/cli/main.ts"], ["packages/handler-example/app/main.ts"]])(
  "runs on a range with a user-facing change to %s",
  { timeout: 1000 },
  (file) => {
    expect.hasAssertions();

    expect(decided({ changed: ["docs/verification.md", file] })).toStrictEqual({
      ok: true,
      value: {
        go: true,
        line: `runs: ${file} is user-facing and changed since ${TAG}, and no gate run started in the last 30 minutes`,
        promote: true,
      },
    });
  },
);

it("runs when nothing was ever deployed", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(decided({ tag: "" })).toStrictEqual({
    ok: true,
    value: {
      go: true,
      line: "runs: no deploy/* tag yet, and no gate run started in the last 30 minutes",
      promote: true,
    },
  });
});

it("waits, until it is 30 minutes old, when a gate run started 10 minutes ago", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const runs = [
    { minutesAgo: FIVE_MINUTES, ranTheGate: false, run: "1" },
    { minutesAgo: TEN_MINUTES, ranTheGate: true, run: "2" },
  ];

  expect(decided({ runs })).toStrictEqual({
    ok: true,
    value: {
      go: false,
      line: `waits: a gate run started at ${startedAt(TEN_MINUTES)}, under 30 minutes ago; deciding again at ${startedAt(-TWENTY_MINUTES)}`,
      promote: false,
      retryAtMillis: NOW_MS + TWENTY_MINUTES * MINUTE_MS,
    },
  });
});

it("runs when the last gate run started 31 minutes ago", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const decision = decided({ runs: [{ minutesAgo: THIRTY_ONE_MINUTES, ranTheGate: true, run: "3" }] });

  expect(decision).toMatchObject({ ok: true, value: { go: true } });
});

it("always runs on workflow_dispatch, even on a deployed commit just after a gate run", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const runs = [{ minutesAgo: A_MINUTE, ranTheGate: true, run: "4" }];

  expect(decided({ ahead: BEHIND, event: "workflow_dispatch", runs })).toStrictEqual({
    ok: true,
    value: { go: true, line: "runs: workflow_dispatch always runs", promote: true },
  });
});

it("fails, naming the command, when git can't read the history", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const decision = releaseGo({
    asked: { event: "schedule", nowMillis: NOW_MS, sha: SHA, thisRun: THIS_RUN },
    gh: () => ({ ok: true, value: "[]" }),
    git: () => ({ ok: false, reason: "git for-each-ref failed" }),
  });

  expect(decision).toStrictEqual({ ok: false, reason: "git for-each-ref failed" });
});

it("fails, naming the command, when gh can't list the Release runs", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const decision = releaseGo({
    asked: { event: "schedule", nowMillis: NOW_MS, sha: SHA, thisRun: THIS_RUN },
    gh: () => ({ ok: false, reason: "gh run list failed" }),
    git: gitOf(HISTORY),
  });

  expect(decision).toStrictEqual({ ok: false, reason: "gh run list failed" });
});

function failingAt(failing: string, value: string): (args: readonly string[]) => Outcome<string> {
  return (args) => {
    if (args.includes(failing)) {
      return { ok: false, reason: `${failing} failed` };
    }
    return { ok: true, value };
  };
}

function listingAnd(listing: string, jobs: string): (args: readonly string[]) => Outcome<string> {
  return (args) => {
    if (args.includes("list")) {
      return { ok: true, value: listing };
    }
    return { ok: true, value: jobs };
  };
}

const RECENT_RUN = JSON.stringify([{ databaseId: 7, startedAt: startedAt(A_MINUTE) }]);

it.each([["rev-list"], ["diff"]])("fails, naming the command, when git %s fails", { timeout: 1000 }, (failing) => {
  expect.hasAssertions();

  const decision = releaseGo({
    asked: { event: "schedule", nowMillis: NOW_MS, sha: SHA, thisRun: THIS_RUN },
    gh: () => ({ ok: true, value: "[]" }),
    git: failingAt(failing, `${TAG}\n`),
  });

  expect(decision).toStrictEqual({ ok: false, reason: `${failing} failed` });
});

it("fails, naming the command, when gh can't read a recent Release run's jobs", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const decision = releaseGo({
    asked: { event: "schedule", nowMillis: NOW_MS, sha: SHA, thisRun: THIS_RUN },
    gh: failingAt("view", RECENT_RUN),
    git: gitOf(HISTORY),
  });

  expect(decision).toStrictEqual({ ok: false, reason: "view failed" });
});

it.each([
  ["a listing that isn't JSON", "not json", "{}"],
  [
    "runs with no ID, no start time or a start time that isn't one",
    JSON.stringify([{ startedAt: startedAt(A_MINUTE) }, { databaseId: 8 }, { databaseId: 9, startedAt: "soon" }]),
    "{}",
  ],
  ["a recent run whose jobs have no names", RECENT_RUN, JSON.stringify({ jobs: [{ conclusion: "success" }] })],
  ["a recent run whose jobs aren't JSON", RECENT_RUN, "not json"],
])("counts no gate run from %s", { timeout: 1000 }, (_name, listing, jobs) => {
  expect.hasAssertions();

  const decision = releaseGo({
    asked: { event: "schedule", nowMillis: NOW_MS, sha: SHA, thisRun: THIS_RUN },
    gh: listingAnd(listing, jobs),
    git: gitOf(HISTORY),
  });

  expect(decision).toMatchObject({ ok: true, value: { go: true } });
});
