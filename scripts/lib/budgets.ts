import type { Outcome } from "./tools.ts";
import { verdictLine } from "./verdict.ts";

const SECOND_MS = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MINUTE_MS = SECONDS_PER_MINUTE * SECOND_MS;
const HOUR_MS = MINUTES_PER_HOUR * MINUTE_MS;
const PRE_COMMIT_SECONDS = 2;
const CHECK_MINUTES = 2;
const LANDING_SECONDS = 30;
const V1_CHECK_MINUTES = 3;
const RELEASE_GATE_MINUTES = 6;
const LANDED_TO_LIVE_MINUTES = 30;

const BUDGETS = [
  { budget: PRE_COMMIT_SECONDS * SECOND_MS, stage: "pre-commit" },
  { budget: CHECK_MINUTES * MINUTE_MS, stage: "pnpm check" },
  { budget: LANDING_SECONDS * SECOND_MS, stage: "landing" },
  { budget: V1_CHECK_MINUTES * MINUTE_MS, stage: "v1 Check" },
  { budget: RELEASE_GATE_MINUTES * MINUTE_MS, stage: "Release gate" },
  { budget: LANDED_TO_LIVE_MINUTES * MINUTE_MS, stage: "landed to live" },
] as const;

type Stage = (typeof BUDGETS)[number]["stage"];
type StageTimes = Readonly<Record<Stage, Outcome<readonly number[]>>>;

interface BudgetReport {
  readonly lines: readonly string[];
  readonly verdict: string;
}

interface Judged {
  readonly line: string;
  readonly over: boolean;
  readonly stage: Stage;
}

const JUDGED_RUNS = 10;
const NONE = 0;
const ONE = 1;
const HALF = 2;
const ONE_DECIMAL = 10;

function median(values: readonly number[]): number {
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / HALF);
  if (sorted.length % HALF === NONE) {
    return ((sorted[middle - ONE] ?? NONE) + (sorted[middle] ?? NONE)) / HALF;
  }
  return sorted[middle] ?? NONE;
}

function rounded(value: number, unit: number): string {
  return String(Math.round((value / unit) * ONE_DECIMAL) / ONE_DECIMAL);
}

function duration(milliseconds: number): string {
  if (milliseconds < MINUTE_MS) {
    return `${rounded(milliseconds, SECOND_MS)} s`;
  }
  if (milliseconds < HOUR_MS) {
    return `${rounded(milliseconds, MINUTE_MS)} min`;
  }
  return `${rounded(milliseconds, HOUR_MS)} h`;
}

function runsWord(count: number): string {
  if (count === JUDGED_RUNS) {
    return `the last ${count} runs`;
  }
  if (count === ONE) {
    return "1 run";
  }
  return `${count} runs`;
}

function judgedRuns(stage: Stage, budget: number, last: readonly number[]): Judged {
  const value = median(last);
  const line = `${stage}: median ${duration(value)} over ${runsWord(last.length)}, budget ${duration(budget)}`;
  if (last.length < JUDGED_RUNS) {
    return { line: `${line}: not judged, fewer than ${JUDGED_RUNS} runs`, over: false, stage };
  }
  if (value > budget) {
    return { line: `${line}: over budget`, over: true, stage };
  }
  return { line, over: false, stage };
}

function judged(stage: Stage, budget: number, times: Outcome<readonly number[]>): Judged {
  if (!times.ok) {
    return { line: `${stage}: not judged, ${times.reason}`, over: false, stage };
  }
  const last = times.value.slice(NONE, JUDGED_RUNS);
  if (last.length === NONE) {
    return { line: `${stage}: not judged, no runs yet (budget ${duration(budget)})`, over: false, stage };
  }
  return judgedRuns(stage, budget, last);
}

function verdictOf(results: readonly Judged[]): string {
  const over = results.filter((result) => result.over).map((result) => result.stage);
  if (over.length === NONE) {
    return verdictLine([]);
  }
  return verdictLine([`${over.join(", ")} over budget`]);
}

function budgetReport(stageTimes: StageTimes): BudgetReport {
  const results = BUDGETS.map((entry) => judged(entry.stage, entry.budget, stageTimes[entry.stage]));
  return { lines: results.map((result) => result.line), verdict: verdictOf(results) };
}

export { JUDGED_RUNS, budgetReport };
