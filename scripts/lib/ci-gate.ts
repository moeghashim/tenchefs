import type { CheckRun, Job, Unreadable } from "./check-run.ts";
import type { Command, Step, Stopped } from "./merge-steps.ts";
import { DONE, run, stop, tail } from "./merge-steps.ts";
import { described, failuresOf, reportJobs } from "./ci-failures.ts";
import { field, list, parseJson } from "./json.ts";
import { readCheckRun, redJobs } from "./check-run.ts";
import type { Failure } from "./ci-failures.ts";
import type { Polled } from "./ci-verdict.ts";
import { sameCommitVerdict } from "./ci-verdict.ts";

interface CiGateOptions {
  readonly appear: number;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly event: string;
  readonly gh: Command;
  readonly log: (line: string) => void;
  readonly polls: number;
  readonly sleep: () => void;
  readonly subject: string;
}

interface Watched {
  readonly checkRun: CheckRun;
  readonly runNumber: number;
}

const NONE = 0;
const NO_RUN = "none";
const NEXT = 1;
const COMPLETED = "completed";
const CANCELLED = "cancelled";
function listOf(event: string): readonly string[] {
  return ["run", "list", "--workflow", "Check", "--event", event, "--limit", "1", "--json", "databaseId"];
}

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
  const count = `(${waited + NEXT} of ${options.appear})`;
  options.log(`${options.subject} has no Check ${options.event} run yet: waiting ${count}.`);
  options.sleep();
}

function awaitRun(options: CiGateOptions, waited: number): number | Stopped {
  const args = [...listOf(options.event), ...options.args];
  const found = findRun(options, args);
  if (typeof found === "number") {
    return found;
  }
  if (found !== NO_RUN) {
    return unreadable(options, found);
  }
  if (waited >= options.appear) {
    return stop(`${options.subject} has no Check ${options.event} run: ${args.join(" ")}`);
  }
  waitForRun(options, waited);
  return awaitRun(options, waited + NEXT);
}

function notGreen(checkRun: CheckRun): readonly Job[] {
  return redJobs(checkRun);
}

function namesOf(checkRun: CheckRun, failed: readonly Failure[]): readonly string[] {
  const named = failed.map((failure) => `${failure.job.name} (${failure.job.conclusion})`);
  if (checkRun.status === COMPLETED && checkRun.jobs.length === NONE) {
    return [...named, "the run (no jobs)"];
  }
  return named;
}

function red(options: CiGateOptions, watched: Watched): Step {
  const { checkRun } = watched;
  const failed = failuresOf({ ...options, jobs: notGreen(checkRun), runNumber: watched.runNumber });
  const named = namesOf(checkRun, failed);
  if (named.length === NONE) {
    return DONE;
  }
  reportJobs({ ...options, jobs: checkRun.jobs });
  const details = failed.map((failure) => described(failure)).join("");
  const reason = `${options.subject}'s latest Check run is red: ${named.join(", ")}.\n${checkRun.url}${details}`;
  return { ...stop(reason), jobs: named.map((name) => name.replace(/ \([^)]*\)$/u, "")) };
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

function verdict(options: CiGateOptions, watched: Watched): Step | "running" {
  const { checkRun } = watched;
  const finished = checkRun.status === COMPLETED;
  if (!finished && notGreen(checkRun).length === NONE) {
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

function cancelledOnly(checkRun: CheckRun): boolean {
  const failed = notGreen(checkRun);
  return failed.length > NONE && failed.every((job) => job.conclusion === CANCELLED);
}

function supersededBy(options: CiGateOptions, { checkRun, runNumber }: Watched): number | typeof NO_RUN {
  if (!cancelledOnly(checkRun)) {
    return NO_RUN;
  }
  const latest = findRun(options, [...listOf(options.event), ...options.args]);
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

function ownVerdict(options: CiGateOptions, watched: Watched, reran: boolean): Polled | Step {
  const own = verdict(options, watched);
  if (own !== "running") {
    return own;
  }
  return { reran, runNumber: watched.runNumber };
}

function advance(options: CiGateOptions, watched: Watched, reran: boolean): Polled | Step {
  const judged = sameCommitVerdict({ ...options, ...watched, reran });
  if (judged.kind === "red") {
    return redOf(options, judged.runNumber);
  }
  if (judged.kind === "next") {
    for (const line of judged.lines) {
      options.log(line);
    }
    return judged.next;
  }
  return ownVerdict(options, watched, reran);
}

function poll(options: CiGateOptions, polled: Polled, waited: number): Step {
  const watched = current(options, polled.runNumber);
  if ("kind" in watched) {
    return watched;
  }
  const next = advance(options, watched, polled.reran);
  if ("kind" in next) {
    return next;
  }
  const slept = wait(options, watched.checkRun, waited);
  if (slept.kind === "stopped") {
    return slept;
  }
  return poll(options, next, waited + NEXT);
}

function ciGreen(options: CiGateOptions): Step {
  const runNumber = awaitRun(options, NONE);
  if (typeof runNumber !== "number") {
    return runNumber;
  }
  return poll(options, { reran: false, runNumber }, NONE);
}

export { ciGreen };
