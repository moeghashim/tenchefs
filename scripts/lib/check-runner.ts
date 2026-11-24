import type { FileTiming, ReportFile } from "./slowest-files.ts";
import { TIMINGS_DIR, readTimings, saveFullList, slowestNames, slowestSummary } from "./slowest-files.ts";
import { holdMachineLock, waitingLine } from "./machine-lock.ts";
import type { Holder } from "./machine-lock.ts";
import { firstError } from "./first-error.ts";
import { once } from "node:events";
import { rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { verdictLine } from "./verdict.ts";

interface Check {
  readonly afterTests?: true;
  readonly budget: number;
  readonly command: readonly string[];
  readonly job: string;
  readonly name: string;
  readonly timings?: ReportFile;
}

interface Checks {
  readonly checks: readonly Check[];
  readonly inCi: boolean;
  readonly job: string;
  readonly lockFile: string;
}

interface Outcome {
  readonly check: Check;
  readonly code: number;
  readonly output: string;
  readonly seconds: number;
  readonly timings: readonly FileTiming[];
}

interface Closed {
  readonly code: number;
  readonly error: string;
}

const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;
const NONE = 0;
const DECIMALS = 1;
const MS_PER_SECOND = 1000;
const LOCK_POLL_MS = 1000;

async function closeOf(closing: Promise<readonly unknown[]>): Promise<Closed> {
  try {
    const [code] = await closing;
    if (typeof code === "number") {
      return { code, error: "" };
    }
    return { code: EXIT_FAILURE, error: "" };
  } catch (error) {
    return { code: EXIT_FAILURE, error: String(error instanceof Error && error.message) };
  }
}

function reportsOf(check: Check): readonly ReportFile[] {
  return [check.timings].flatMap((reportFile) => reportFile ?? []);
}

function timingsOf(check: Check): readonly FileTiming[] {
  return reportsOf(check).flatMap((reportFile) => {
    const timings = readTimings(reportFile);
    saveFullList({ dir: TIMINGS_DIR, label: check.name, timings });
    return timings;
  });
}

async function run(check: Check): Promise<Outcome> {
  for (const reportFile of reportsOf(check)) {
    rmSync(reportFile.file, { force: true });
  }
  const started = performance.now();
  const [program = "true", ...args] = check.command;
  const child = spawn(program, args, { stdio: ["ignore", "pipe", "pipe"] });
  const chunks: string[] = [];
  child.stdout.on("data", (chunk: unknown) => {
    chunks.push(String(chunk));
  });
  child.stderr.on("data", (chunk: unknown) => {
    chunks.push(String(chunk));
  });
  const closed = await closeOf(once(child, "close"));
  return {
    check,
    code: closed.code,
    output: `${chunks.join("")}${closed.error}`,
    seconds: (performance.now() - started) / MS_PER_SECOND,
    timings: timingsOf(check),
  };
}

function overBudget(outcome: Outcome): boolean {
  return outcome.seconds > outcome.check.budget;
}

function passed(outcome: Outcome): boolean {
  return outcome.code === EXIT_SUCCESS;
}

function statusOf(outcome: Outcome): string {
  if (outcome.code !== EXIT_SUCCESS) {
    return "FAIL";
  }
  if (overBudget(outcome)) {
    return "SLOW";
  }
  return "ok  ";
}

function slowestOf(outcome: Outcome): string {
  if (outcome.timings.length === NONE) {
    return "";
  }
  return ` Slowest files: ${slowestNames(outcome.timings)}.`;
}

function warnOverBudget(outcome: Outcome, inCi: boolean): void {
  const { budget, name } = outcome.check;
  const warning = `${name} took ${outcome.seconds.toFixed(DECIMALS)}s, over its ${String(budget)}s budget. A time budget warns and never fails the run (ADR 0030).${slowestOf(outcome)}`;
  if (inCi) {
    console.log(`::warning title=${name} over its time budget::${warning}`);
    return;
  }
  console.error(`warning: ${warning}`);
}

function reportFirstError(output: string): void {
  const excerpt = firstError(output);
  if (excerpt.length === NONE) {
    return;
  }
  console.log("     First error:");
  console.log(excerpt.join("\n").replaceAll(/^/gmu, "       "));
}

function report(outcome: Outcome, inCi: boolean): void {
  const { budget, name } = outcome.check;
  console.log(`${statusOf(outcome)} ${name} (${outcome.seconds.toFixed(DECIMALS)}s, budget ${String(budget)}s)`);
  if (reportsOf(outcome.check).length > NONE) {
    console.log(slowestSummary({ label: name, timings: outcome.timings }).replaceAll(/^/gmu, "     "));
  }
  if (outcome.code !== EXIT_SUCCESS) {
    reportFirstError(outcome.output);
    console.log(outcome.output.trimEnd().replaceAll(/^/gmu, "     "));
  }
  if (overBudget(outcome)) {
    warnOverBudget(outcome, inCi);
  }
}

async function runTogether(selected: readonly Check[]): Promise<readonly Outcome[]> {
  const pending: Promise<Outcome>[] = [];
  for (const check of selected) {
    pending.push(run(check));
  }
  const outcomes = await Promise.all(pending);
  return outcomes;
}

async function runSelected(selected: readonly Check[]): Promise<readonly Outcome[]> {
  const first = await runTogether(selected.filter((check) => check.afterTests !== true));
  const after = await runTogether(selected.filter((check) => check.afterTests === true));
  return [...first, ...after];
}

function waiting(holder: Holder): void {
  console.error(waitingLine({ holder, script: "check" }));
}

async function runLocked(selected: readonly Check[], { inCi, lockFile }: Checks): Promise<readonly Outcome[]> {
  if (inCi) {
    return runSelected(selected);
  }
  const release = await holdMachineLock({
    file: lockFile,
    onWait: waiting,
    pollMs: LOCK_POLL_MS,
    worktree: process.cwd(),
  });
  try {
    return await runSelected(selected);
  } finally {
    release();
  }
}

function exitCodeOf(failed: readonly string[]): number {
  console.log(verdictLine(failed));
  if (failed.length === NONE) {
    return EXIT_SUCCESS;
  }
  return EXIT_FAILURE;
}

async function runChecks(options: Checks): Promise<number> {
  const { checks, inCi, job } = options;
  const selected = checks.filter((check) => job === "" || check.job === job);
  if (selected.length === NONE) {
    console.error(`check: no checks in job ${job}. Jobs: ${[...new Set(checks.map((check) => check.job))].join(", ")}`);
    return exitCodeOf([`no checks in job ${job}`]);
  }
  const final = await runLocked(selected, options);
  for (const outcome of final) {
    report(outcome, inCi);
  }
  return exitCodeOf(final.filter((outcome) => !passed(outcome)).map((outcome) => outcome.check.name));
}

export type { Check };
export { runChecks };
