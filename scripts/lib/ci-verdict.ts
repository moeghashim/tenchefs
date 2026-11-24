import type { Command, Step } from "./merge-steps.ts";
import { DONE, run, stop, tail } from "./merge-steps.ts";
import { field, list, parseJson, text } from "./json.ts";
import type { CheckRun } from "./check-run.ts";
import { redJobs } from "./check-run.ts";

interface Polled {
  readonly reran: boolean;
  readonly runNumber: number;
}

interface SameCommit extends Polled {
  readonly args: readonly string[];
  readonly checkRun: CheckRun;
  readonly cwd: string;
  readonly gh: Command;
  readonly subject: string;
}

interface Listed {
  readonly conclusion: string;
  readonly runNumber: number;
  readonly status: string;
  readonly url: string;
}

type Verdict =
  | { readonly kind: "alone" }
  | { readonly kind: "next"; readonly lines: readonly string[]; readonly next: Polled | Step }
  | { readonly kind: "red"; readonly runNumber: number };

const NONE = 0;
const NEXT = 1;
const MISSING = -1;
const GREEN = "success";
const CANCELLED = "cancelled";
const COMPLETED = "completed";
const NOT_FOUND = "none";
const ALONE: Verdict = { kind: "alone" };
const LIST = ["run", "list", "--workflow", "Check", "--event", "push", "--json", "databaseId,status,conclusion,url"];

function ghJson(options: SameCommit, args: readonly string[]): unknown {
  const ran = run(options.cwd, ...options.gh, ...args);
  if (!ran.ok) {
    return null;
  }
  return parseJson(ran.output);
}

function shaOf(options: SameCommit): string {
  const flag = options.args.indexOf("--commit");
  const given = options.args.at(flag + NEXT);
  if (flag !== MISSING && typeof given === "string") {
    return given;
  }
  const viewed = ghJson(options, ["run", "view", String(options.runNumber), "--json", "headSha"]);
  return text(field(viewed, "headSha")) ?? "";
}

function listedOf(value: unknown): readonly Listed[] {
  const runNumber = field(value, "databaseId");
  const status = text(field(value, "status"));
  if (typeof runNumber !== "number" || typeof status !== "string") {
    return [];
  }
  return [
    { conclusion: text(field(value, "conclusion")) ?? "", runNumber, status, url: text(field(value, "url")) ?? "" },
  ];
}

function othersOn(options: SameCommit, sha: string): readonly Listed[] {
  const runs = list(ghJson(options, [...LIST, "--commit", sha])) ?? [];
  return runs
    .flatMap((value) => listedOf(value))
    .filter(({ runNumber }) => runNumber !== options.runNumber)
    .toSorted((left, right) => right.runNumber - left.runNumber);
}

function notGreenJobs(checkRun: CheckRun): readonly string[] {
  return redJobs(checkRun).map((job) => job.conclusion);
}

function stopped(reason: string): Verdict {
  return { kind: "next", lines: [], next: stop(reason) };
}

function rerun(options: SameCommit, newest: number): Verdict {
  if (options.reran) {
    return stopped(
      `${options.subject}'s Check run ${newest} was cancelled again after its rerun, as was every other run on the same commit.`,
    );
  }
  const ran = run(options.cwd, ...options.gh, "run", "rerun", String(newest));
  if (!ran.ok) {
    return stopped(`Could not rerun ${options.subject}'s cancelled Check run ${newest}:\n${tail(ran.output)}`);
  }
  const line = `Every Check run on ${options.subject}'s commit was cancelled: rerunning the newest, run ${newest}.`;
  return { kind: "next", lines: [line], next: { reran: true, runNumber: newest } };
}

function failedOrCancelled(options: SameCommit, others: readonly Listed[]): Verdict {
  if (options.checkRun.status !== COMPLETED) {
    return { kind: "next", lines: [], next: { reran: options.reran, runNumber: options.runNumber } };
  }
  const failed = others.find(({ conclusion, status }) => status === COMPLETED && conclusion !== CANCELLED) ?? NOT_FOUND;
  if (failed !== NOT_FOUND) {
    return { kind: "red", runNumber: failed.runNumber };
  }
  return rerun(options, Math.max(options.runNumber, ...others.map(({ runNumber }) => runNumber)));
}

function afterOthers(options: SameCommit, others: readonly Listed[]): Verdict {
  const finished = options.checkRun.status === COMPLETED;
  const running = others.find(({ status }) => status !== COMPLETED) ?? NOT_FOUND;
  if (finished && running !== NOT_FOUND) {
    const line = `${options.subject}'s Check run ${options.runNumber} did not pass; watching run ${running.runNumber} on the same commit.`;
    return { kind: "next", lines: [line], next: { reran: options.reran, runNumber: running.runNumber } };
  }
  if (notGreenJobs(options.checkRun).some((conclusion) => conclusion !== CANCELLED)) {
    return ALONE;
  }
  return failedOrCancelled(options, others);
}

function needsOthers(checkRun: CheckRun): boolean {
  return notGreenJobs(checkRun).length > NONE || (checkRun.status === COMPLETED && checkRun.jobs.length === NONE);
}

function judged(options: SameCommit, sha: string): Verdict {
  const others = othersOn(options, sha);
  const green = others.find(({ conclusion, status }) => status === COMPLETED && conclusion === GREEN) ?? NOT_FOUND;
  if (green === NOT_FOUND) {
    return afterOthers(options, others);
  }
  const line = `${options.subject}'s Check run ${green.runNumber} on the same commit is green: ${green.url}`;
  return { kind: "next", lines: [line], next: DONE };
}

function sameCommitVerdict(options: SameCommit): Verdict {
  if (!needsOthers(options.checkRun)) {
    return ALONE;
  }
  const sha = shaOf(options);
  if (sha === "") {
    return ALONE;
  }
  return judged(options, sha);
}

export type { Polled };
export { sameCommitVerdict };
