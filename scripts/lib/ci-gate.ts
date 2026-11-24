import type { CheckRun, Job, Unreadable } from "./check-run.ts";
import type { Command, Step, Stopped } from "./merge-steps.ts";
import { DONE, run, stop, tail } from "./merge-steps.ts";
import { UNVOUCHED, vouchedGreen } from "./ci-vouch.ts";
import { described, failuresOf, reportJobs } from "./ci-failures.ts";
import { field, list, parseJson } from "./json.ts";
import { readCheckRun, redJobs } from "./check-run.ts";
import type { Failure } from "./ci-failures.ts";
import type { Polled } from "./ci-verdict.ts";
import type { Refused } from "./ci-rerun.ts";
import { retriedOnce } from "./ci-rerun.ts";
import { sameCommitVerdict } from "./ci-verdict.ts";

interface CiGateOptions {
  readonly appear: number;
  readonly args: readonly string[];
  readonly base: readonly string[];
  readonly cwd: string;
  readonly gh: Command;
  readonly log: (line: string) => void;
  readonly polls: number;
  readonly rerunRed?: boolean;
  readonly sleep: () => void;
  readonly subject: string;
  readonly vouchedBy: string;
}

interface Watched {
  readonly checkRun: CheckRun;
  readonly runNumber: number;
}

interface Progress {
  readonly reran: boolean;
  readonly waited: number;
}

const NONE = 0;
const NO_RUN = "none";
const NEXT = 1;
const COMPLETED = "completed";
const CANCELLED = "cancelled";
const LIST = ["run", "list", "--workflow", "Check", "--event", "push", "--limit", "1", "--json", "databaseId"];

function unreadable(options: CiGateOptions, read: Unreadable): Stopped {
  return stop(`Could not read ${options.subject}'s Check run: gh ${read.args.join(" ")}\n${tail(read.output)}`);
}

function runs(args: readonly string[], options: CiGateOptions): readonly unknown[] | Unreadable {
  const ran = run(options.cwd, ...options.gh, ...args);
  if (!ran.ok) {
    return { args, kind: "unreadable", output: ran.output };
  }
  return list(parseJson(ran.output)) ?? { args, kind: "unreadable", output: "gh printed no list of runs." };
}

function findRun(options: CiGateOptions, args: readonly string[]): number | Unreadable | typeof NO_RUN {
  const listed = runs(args, options);
  if ("kind" in listed) {
    return listed;
  }
  const runNumber = field(listed.at(NONE), "databaseId");
  if (typeof runNumber !== "number") {
    return NO_RUN;
  }
  return runNumber;
}

function waitForRun(options: CiGateOptions, waited: number): void {
  options.log(`${options.subject} has no Check push run yet: waiting (${waited + NEXT} of ${options.appear}).`);
  options.sleep();
}

function awaitRun(options: CiGateOptions, waited: number): number | Stopped {
  const args = [...LIST, ...options.args];
  const found = findRun(options, args);
  if (typeof found === "number") {
    return found;
  }
  if (found !== NO_RUN) {
    return unreadable(options, found);
  }
  if (waited >= options.appear) {
    return stop(`${options.subject} has no Check push run: ${args.join(" ")}`);
  }
  waitForRun(options, waited);
  return awaitRun(options, waited + NEXT);
}

function notGreen(checkRun: CheckRun): readonly Job[] {
  return redJobs(checkRun);
}

function baseRun(options: CiGateOptions): CheckRun | typeof NO_RUN {
  const runNumber = findRun(options, [...LIST, ...options.base]);
  if (typeof runNumber !== "number") {
    return NO_RUN;
  }
  const read = readCheckRun({ ...options, runNumber });
  if (read.kind === "unreadable") {
    return NO_RUN;
  }
  return read;
}

function inheritedFrom(options: CiGateOptions, failed: readonly Job[]): string {
  if (options.base.length === NONE || failed.length === NONE) {
    return "";
  }
  const base = baseRun(options);
  if (base === NO_RUN) {
    return "";
  }
  const redOnBase = new Set(notGreen(base).map((job) => job.name));
  if (!failed.every((job) => redOnBase.has(job.name))) {
    return "";
  }
  return `\nThe same jobs failed on v1's Check run for ${options.subject}'s merge-base: ${base.url}\nYour base was red; merge the current green v1 into ${options.subject} (git merge origin/v1), push, and rerun merge-ticket.`;
}

function namesOf(checkRun: CheckRun, failed: readonly Failure[]): readonly string[] {
  const named = failed.map((failure) => `${failure.job.name} (${failure.job.conclusion})`);
  if (checkRun.status === COMPLETED && checkRun.jobs.length === NONE) {
    return [...named, "the run (no jobs)"];
  }
  return named;
}

function red(options: CiGateOptions, watched: Watched): Refused | Step {
  const { checkRun } = watched;
  const failed = failuresOf({ ...options, jobs: notGreen(checkRun), runNumber: watched.runNumber });
  const named = namesOf(checkRun, failed);
  if (named.length === NONE) {
    return DONE;
  }
  reportJobs({ ...options, jobs: checkRun.jobs });
  const details = failed.map((failure) => described(failure)).join("");
  const inherited = inheritedFrom(
    options,
    failed.map((failure) => failure.job),
  );
  const reason = `${options.subject}'s latest Check run is red: ${named.join(", ")}.\n${checkRun.url}${details}${inherited}`;
  return { ...stop(reason), jobs: named.map((name) => name.replace(/ \([^)]*\)$/u, "")), runNumber: watched.runNumber };
}

function wait(options: CiGateOptions, checkRun: CheckRun, waited: number): Step {
  if (waited >= options.polls) {
    return stop(
      `${options.subject}'s latest Check run was still running after ${options.polls} waits: ${checkRun.url}`,
    );
  }
  options.log(
    `${options.subject}'s latest Check run is still running: waiting (${waited + NEXT} of ${options.polls}). ${checkRun.url}`,
  );
  options.sleep();
  return DONE;
}

function green(options: CiGateOptions, checkRun: CheckRun): Step {
  reportJobs({ ...options, jobs: checkRun.jobs });
  options.log(`${options.subject}'s latest Check run is green: ${checkRun.url}`);
  return DONE;
}

function judgedLater(options: CiGateOptions, checkRun: CheckRun): boolean {
  return options.rerunRed === true || notGreen(checkRun).length === NONE;
}

function verdict(options: CiGateOptions, watched: Watched): Step | "running" {
  const { checkRun } = watched;
  const finished = checkRun.status === COMPLETED;
  if (!finished && judgedLater(options, checkRun)) {
    return "running";
  }
  const refused = red(options, watched);
  if (refused.kind === "stopped") {
    return refused;
  }
  if (!finished) {
    return "running";
  }
  return green(options, checkRun);
}

function vouched(options: CiGateOptions, runNumber: number, waited: number): boolean {
  if (options.vouchedBy === "" || waited !== NONE) {
    return false;
  }
  const voucher = vouchedGreen({ ...options, branchPrefix: options.vouchedBy, runNumber });
  if (voucher === UNVOUCHED) {
    return false;
  }
  options.log(
    `${options.subject}'s latest Check run is still running or was cancelled, but ${voucher.branch}'s Check run on the same commit is green: ${voucher.checkRun.url}`,
  );
  return true;
}

function cancelledOnly(checkRun: CheckRun): boolean {
  const failed = notGreen(checkRun);
  return failed.length > NONE && failed.every((job) => job.conclusion === CANCELLED);
}

function supersededBy(options: CiGateOptions, { checkRun, runNumber }: Watched): number | typeof NO_RUN {
  if (!cancelledOnly(checkRun)) {
    return NO_RUN;
  }
  const latest = findRun(options, [...LIST, ...options.args]);
  if (typeof latest !== "number" || latest === runNumber) {
    return NO_RUN;
  }
  return latest;
}

function current(options: CiGateOptions, runNumber: number): Watched | Stopped {
  const checkRun = readCheckRun({ ...options, runNumber });
  if (checkRun.kind === "unreadable") {
    return unreadable(options, checkRun);
  }
  const newer = supersededBy(options, { checkRun, runNumber });
  if (newer === NO_RUN) {
    return { checkRun, runNumber };
  }
  options.log(`${options.subject}'s Check run ${runNumber} was cancelled by a newer run: reading run ${newer}.`);
  return current(options, newer);
}

function redOf(options: CiGateOptions, runNumber: number): Step {
  const checkRun = readCheckRun({ ...options, runNumber });
  if (checkRun.kind === "unreadable") {
    return unreadable(options, checkRun);
  }
  return red(options, { checkRun, runNumber });
}

function ownVerdict(options: CiGateOptions, watched: Watched, { reran, waited }: Progress): Polled | Step {
  const own = verdict(options, watched);
  if (own !== "running") {
    return own;
  }
  if (vouched(options, watched.runNumber, waited)) {
    return DONE;
  }
  return { reran, runNumber: watched.runNumber };
}

function vouchedCancelled(options: CiGateOptions, watched: Watched): boolean {
  return cancelledOnly(watched.checkRun) && vouched(options, watched.runNumber, NONE);
}

function advance(options: CiGateOptions, watched: Watched, progress: Progress): Polled | Step {
  if (vouchedCancelled(options, watched)) {
    return DONE;
  }
  const judged = sameCommitVerdict({ ...options, ...watched, reran: progress.reran });
  if (judged.kind === "red") {
    return redOf(options, judged.runNumber);
  }
  if (judged.kind === "next") {
    for (const line of judged.lines) {
      options.log(line);
    }
    return judged.next;
  }
  return ownVerdict(options, watched, progress);
}

function poll(options: CiGateOptions, polled: Polled, waited: number): Step {
  const watched = current(options, polled.runNumber);
  if ("kind" in watched) {
    return watched;
  }
  const next = advance(options, watched, { reran: polled.reran, waited });
  if ("kind" in next) {
    return next;
  }
  const slept = wait(options, watched.checkRun, waited);
  if (slept.kind === "stopped") {
    return slept;
  }
  return poll(options, next, waited + NEXT);
}

function pollOnce(options: CiGateOptions): (runNumber: number) => Step {
  return (runNumber) => poll({ ...options, rerunRed: false }, { reran: false, runNumber }, NONE);
}

function ciGreen(options: CiGateOptions): Step {
  const runNumber = awaitRun(options, NONE);
  if (typeof runNumber !== "number") {
    return runNumber;
  }
  return retriedOnce({ ...options, again: pollOnce(options), first: poll(options, { reran: false, runNumber }, NONE) });
}

export { ciGreen };
