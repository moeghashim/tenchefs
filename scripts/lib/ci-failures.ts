import type { Command } from "./merge-steps.ts";
import type { Job } from "./check-run.ts";
import { failingTestsBlock } from "./failing-tests.ts";
import { run } from "./merge-steps.ts";

interface Failure {
  readonly job: Job;
  readonly log: string;
}

interface Logs {
  readonly cwd: string;
  readonly gh: Command;
  readonly log: (line: string) => void;
}

const LOG_LINES = -20;
const FAILURE = "failure";
const BUDGET_WARNING = /over its \S+ budget/u;
const FAILED_CHECK = /\bFAIL\b/u;

function failedLog(options: Logs, runNumber: number, job: Job): string {
  if (job.jobArg === "") {
    return "";
  }
  return run(options.cwd, ...options.gh, "run", "view", String(runNumber), "--job", job.jobArg, "--log-failed").output;
}

function budgetOnly(failure: Failure): boolean {
  return failure.job.conclusion === FAILURE && BUDGET_WARNING.test(failure.log) && !FAILED_CHECK.test(failure.log);
}

function described(failure: Failure): string {
  const steps = failure.job.failedSteps.join(", ") || "none named";
  const heading = `\n${failure.job.name} failed steps: ${steps}`;
  const logged = failure.log.trim();
  if (logged === "") {
    return heading;
  }
  return `${heading}${failingTestsBlock(logged)}\n${logged.split("\n").slice(LOG_LINES).join("\n")}`;
}

function failuresOf(options: Logs & { readonly jobs: readonly Job[]; readonly runNumber: number }): readonly Failure[] {
  const failures = options.jobs.map((job): Failure => ({ job, log: failedLog(options, options.runNumber, job) }));
  for (const failure of failures.filter((each) => budgetOnly(each))) {
    options.log(`WARNING: ${failure.job.name} failed only on a time budget, which never blocks (ADR 0030).`);
  }
  return failures.filter((failure) => !budgetOnly(failure));
}

function stateOf(job: Job): string {
  if (job.conclusion === "") {
    return job.status;
  }
  return job.conclusion;
}

function reportJobs({ jobs, log }: { readonly jobs: readonly Job[]; readonly log: (line: string) => void }): void {
  for (const job of jobs) {
    log(`${job.name}: ${stateOf(job)}`);
  }
}

export type { Failure };
export { described, failuresOf, reportJobs };
