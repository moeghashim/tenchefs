import { field, list, parseJson, text } from "./json.ts";
import type { Command } from "./merge-steps.ts";
import { run } from "./merge-steps.ts";

interface Job {
  readonly completedAt: string;
  readonly conclusion: string;
  readonly failedSteps: readonly string[];
  readonly jobArg: string;
  readonly name: string;
  readonly startedAt: string;
  readonly status: string;
}

interface CheckRun {
  readonly conclusion: string;
  readonly jobs: readonly Job[];
  readonly kind: "run";
  readonly status: string;
  readonly url: string;
}

interface Unreadable {
  readonly args: readonly string[];
  readonly kind: "unreadable";
  readonly output: string;
}

interface Gh {
  readonly cwd: string;
  readonly gh: Command;
}

const FAILURE = "failure";
const COMPLETED = "completed";
const SUCCESS = "success";
const SKIPPED = "skipped";
const NONE = 0;

function completedAs(job: Job, ...conclusions: readonly string[]): boolean {
  return job.status === COMPLETED && conclusions.includes(job.conclusion);
}

function redJobs(checkRun: CheckRun): readonly Job[] {
  const failed = checkRun.jobs.filter((job) => job.status === COMPLETED && !completedAs(job, SUCCESS, SKIPPED));
  if (failed.length > NONE || !checkRun.jobs.every((job) => completedAs(job, SUCCESS, SKIPPED))) {
    return failed;
  }
  return checkRun.jobs.filter((job) => completedAs(job, SKIPPED));
}

function failedStepsOf(value: unknown): readonly string[] {
  return (list(field(value, "steps")) ?? []).flatMap((step) => {
    const name = text(field(step, "name"));
    if (typeof name !== "string" || text(field(step, "conclusion")) !== FAILURE) {
      return [];
    }
    return [name];
  });
}

function jobArgOf(value: unknown): string {
  const databaseId = field(value, "databaseId");
  if (typeof databaseId !== "number") {
    return "";
  }
  return String(databaseId);
}

function textOf(value: unknown, key: string): string {
  return text(field(value, key)) ?? "";
}

function jobsOf(values: readonly unknown[]): readonly Job[] {
  return values.flatMap((value) => {
    const name = text(field(value, "name"));
    const status = text(field(value, "status"));
    if (typeof name !== "string" || typeof status !== "string") {
      return [];
    }
    return [
      {
        completedAt: textOf(value, "completedAt"),
        conclusion: textOf(value, "conclusion"),
        failedSteps: failedStepsOf(value),
        jobArg: jobArgOf(value),
        name,
        startedAt: textOf(value, "startedAt"),
        status,
      },
    ];
  });
}

function checkRunOf(args: readonly string[], output: string): CheckRun | Unreadable {
  const value = parseJson(output);
  const jobs = list(field(value, "jobs"));
  const status = text(field(value, "status"));
  if (!Array.isArray(jobs) || typeof status !== "string") {
    return { args, kind: "unreadable", output: "gh printed no status and jobs." };
  }
  const conclusion = text(field(value, "conclusion")) ?? "";
  return { conclusion, jobs: jobsOf(jobs), kind: "run", status, url: text(field(value, "url")) ?? "" };
}

function readCheckRun({ cwd, gh, runNumber }: Gh & { readonly runNumber: number }): CheckRun | Unreadable {
  const args = ["run", "view", String(runNumber), "--json", "status,conclusion,url,jobs"];
  const ran = run(cwd, ...gh, ...args);
  if (!ran.ok) {
    return { args, kind: "unreadable", output: ran.output };
  }
  return checkRunOf(args, ran.output);
}

export type { CheckRun, Job, Unreadable };
export { readCheckRun, redJobs };
