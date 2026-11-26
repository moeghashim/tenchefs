import { expect, it } from "vitest";
import { landedToLiveTimes, landingTimes, releaseGateTimes, v1CheckTimes } from "../lib/budget-sources.ts";
import type { Outcome } from "../lib/tools.ts";
import { budgetReport } from "../lib/budgets.ts";
import { localStageTimes } from "../lib/stage-log.ts";

type Gh = (args: readonly string[]) => Outcome<string>;

const SECOND_MS = 1000;
const FAST_MS = SECOND_MS;
const SLOW_MS = 9000;
const DAY_MS = 81_000_000;
const RUNS = 10;
const FEW = 4;
const ANCESTRY_FROM = 2;
const FIRST = 0;
const TEN_SECONDS_MS = 10_000;
const THIRTY_SECONDS_MS = 30_000;
const TWO_MINUTES_MS = 120_000;
const FIVE_MINUTES_MS = 300_000;
const SIX_AND_A_HALF_MINUTES_MS = 390_000;
const RECENT_MS = 700;
const OLDER_MS = 500;

function times(count: number, milliseconds: number): readonly number[] {
  return Array.from({ length: count }, () => milliseconds);
}

function read(values: readonly number[]): Outcome<readonly number[]> {
  return { ok: true, value: values };
}

function noStub(key: string): Outcome<string> {
  return { ok: false, reason: `gh ${key} failed: no stub` };
}

function stubGh(answers: Readonly<Record<string, string>>): Gh {
  return (args) => {
    const key = args.join(" ");
    const found = Object.keys(answers).filter((prefix) => key.startsWith(prefix));
    return found.map((prefix): Outcome<string> => ({ ok: true, value: answers[prefix] ?? "" }))[FIRST] ?? noStub(key);
  };
}

function stubGit(tags: string, contains: ReadonlySet<string>): Gh {
  return (args) => {
    if (args.includes("for-each-ref")) {
      return { ok: true, value: tags };
    }
    if (contains.has(args.slice(ANCESTRY_FROM).join(" "))) {
      return { ok: true, value: "" };
    }
    return { ok: false, reason: "not an ancestor" };
  };
}

const ALL_FAST = {
  "Release gate": read(times(RUNS, FAST_MS)),
  "landed to live": read(times(RUNS, FAST_MS)),
  landing: read(times(RUNS, FAST_MS)),
  "pnpm check": read(times(RUNS, FAST_MS)),
  "pre-commit": read(times(RUNS, FAST_MS)),
  "v1 Check": read(times(RUNS, FAST_MS)),
};

it("a stage whose median is over its budget fails the report, naming the stage", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const report = budgetReport({ ...ALL_FAST, "pre-commit": read(times(RUNS, SLOW_MS)) });

  expect(report.lines).toContain("pre-commit: median 9 s over the last 10 runs, budget 2 s: over budget");
  expect(report.verdict).toBe("RESULT: FAIL (pre-commit over budget)");
});

it("one slow run among fast ones leaves the median under budget, so the report passes", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const report = budgetReport({ ...ALL_FAST, "pre-commit": read([SLOW_MS, ...times(RUNS, FAST_MS)]) });

  expect(report.lines).toContain("pre-commit: median 1 s over the last 10 runs, budget 2 s");
  expect(report.verdict).toBe("RESULT: PASS");
});

it("a stage with fewer than 10 runs reports what it has and isn't judged", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const report = budgetReport({ ...ALL_FAST, landing: read(times(FEW, DAY_MS)) });

  expect(report.lines).toContain("landing: median 22.5 h over 4 runs, budget 30 s: not judged, fewer than 10 runs");
  expect(report.verdict).toBe("RESULT: PASS");
});

it("a stage whose data can't be read says so in one line and isn't judged", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const report = budgetReport({ ...ALL_FAST, "v1 Check": { ok: false, reason: "gh could not run" } });

  expect(report.lines).toContain("v1 Check: not judged, gh could not run");
  expect(report.verdict).toBe("RESULT: PASS");
});

it("a stage with no runs yet says so and isn't judged", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const report = budgetReport({ ...ALL_FAST, "Release gate": read([]), landing: read([SLOW_MS]) });

  expect(report.lines).toContain("Release gate: not judged, no runs yet (budget 6 min)");
  expect(report.lines).toContain("landing: median 9 s over 1 run, budget 30 s: not judged, fewer than 10 runs");
});

it("the report has one line per stage with its budget, in the order work flows", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const report = budgetReport(ALL_FAST);

  expect(report.lines).toStrictEqual([
    "pre-commit: median 1 s over the last 10 runs, budget 2 s",
    "pnpm check: median 1 s over the last 10 runs, budget 2 min",
    "landing: median 1 s over the last 10 runs, budget 30 s",
    "v1 Check: median 1 s over the last 10 runs, budget 3 min",
    "Release gate: median 1 s over the last 10 runs, budget 6 min",
    "landed to live: median 1 s over the last 10 runs, budget 30 min",
  ]);
});

it("several stages over budget are all named", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const report = budgetReport({
    ...ALL_FAST,
    landing: read(times(RUNS, TWO_MINUTES_MS)),
    "pre-commit": read(times(RUNS, SLOW_MS)),
  });

  expect(report.lines).toContain("landing: median 2 min over the last 10 runs, budget 30 s: over budget");
  expect(report.verdict).toBe("RESULT: FAIL (pre-commit, landing over budget)");
});

it("local stage times come from the shared log, newest first, for that stage only", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const log = [
    "2026-11-25T10:00:00.000Z\tpre-commit\t500",
    "garbled line",
    "2026-11-25T10:00:01.000Z\tpnpm check\t60000",
    "2026-11-25T10:00:02.000Z\tpre-commit\t700",
    "2026-11-25T10:00:03.000Z\tpre-commit\t",
  ].join("\n");

  expect(localStageTimes({ log: { ok: true, value: log }, stage: "pre-commit" })).toStrictEqual(
    read([RECENT_MS, OLDER_MS]),
  );
  expect(localStageTimes({ log: { ok: false, reason: "no log yet" }, stage: "pnpm check" })).toStrictEqual({
    ok: false,
    reason: "no log yet",
  });
});

it("landing runs from the pull request's head, its merge of v1, to the pull request's merge", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const pulls = JSON.stringify([
    { head: { sha: "aaa" }, merged_at: "2026-11-25T10:01:40Z" },
    { head: { sha: "bbb" }, merged_at: null },
    { head: { sha: "ccc" }, merged_at: "2026-11-25T10:05:00Z" },
  ]);
  const gh = stubGh({
    "api repos/{owner}/{repo}/commits/aaa": JSON.stringify({ commit: { committer: { date: "2026-11-25T10:01:30Z" } } }),
    "api repos/{owner}/{repo}/commits/ccc": JSON.stringify({ commit: { committer: { date: "2026-11-25T10:04:30Z" } } }),
    "api repos/{owner}/{repo}/pulls": pulls,
  });

  expect(landingTimes(gh)).toStrictEqual(read([THIRTY_SECONDS_MS, TEN_SECONDS_MS]));
});

it("v1 Check is the duration of finished push runs on v1, leaving out cancelled ones", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const runs = JSON.stringify([
    { conclusion: "success", startedAt: "2026-11-25T10:00:00Z", updatedAt: "2026-11-25T10:02:00Z" },
    { conclusion: "cancelled", startedAt: "2026-11-25T10:00:00Z", updatedAt: "2026-11-25T10:00:05Z" },
    { conclusion: "failure", startedAt: "2026-11-25T10:00:00Z", updatedAt: "2026-11-25T10:05:00Z" },
  ]);

  expect(v1CheckTimes(stubGh({ "run list --workflow Check": runs }))).toStrictEqual(
    read([TWO_MINUTES_MS, FIVE_MINUTES_MS]),
  );
});

it("the Release gate runs from the run's start to the end of its last gate job", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const runs = JSON.stringify([{ databaseId: 7, startedAt: "2026-11-25T10:00:00Z" }]);
  const jobs = JSON.stringify({
    jobs: [
      { completed_at: "2026-11-25T10:00:10Z", conclusion: "success", name: "choose the commit" },
      { completed_at: "2026-11-25T10:06:30Z", conclusion: "failure", name: "browser 2/3" },
      { completed_at: "2026-11-25T10:05:00Z", conclusion: "success", name: "the gate" },
      { completed_at: "2026-11-25T10:15:00Z", conclusion: "success", name: "release" },
      { completed_at: "2026-11-25T10:16:00Z", conclusion: "skipped", name: "pack smoke" },
    ],
  });
  const gh = stubGh({ "api repos/{owner}/{repo}/actions/runs/7/jobs": jobs, "run list --workflow Release": runs });

  expect(releaseGateTimes(gh)).toStrictEqual(read([SIX_AND_A_HALF_MINUTES_MS]));
});

it("landed to live runs from a pull request's merge to the first deploy tag that contains it", {
  timeout: 5000,
}, () => {
  expect.hasAssertions();

  const pulls = JSON.stringify([
    { head: { sha: "new" }, merged_at: "2026-11-25T10:08:00Z" },
    { head: { sha: "old" }, merged_at: "2026-11-25T10:00:00Z" },
    { head: { sha: "unreleased" }, merged_at: "2026-11-25T10:20:00Z" },
  ]);
  const tags = [
    "deploy/early 2026-11-25T09:00:00Z",
    "deploy/first 2026-11-25T10:02:00Z",
    "deploy/second 2026-11-25T10:13:00Z",
  ].join("\n");
  const contains = new Set(["old deploy/early", "old deploy/first", "old deploy/second", "new deploy/second"]);
  const gh = stubGh({ "api repos/{owner}/{repo}/pulls": pulls });

  expect(landedToLiveTimes({ gh, git: stubGit(tags, contains) })).toStrictEqual(
    read([FIVE_MINUTES_MS, TWO_MINUTES_MS]),
  );
});

it("a GitHub stage whose gh call fails isn't read", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const gh = stubGh({});

  const git = stubGit("", new Set());

  expect(v1CheckTimes(gh).ok).toBe(false);
  expect(landingTimes(gh).ok).toBe(false);
  expect(releaseGateTimes(gh).ok).toBe(false);
  expect(landedToLiveTimes({ gh, git }).ok).toBe(false);
});
