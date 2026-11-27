import { EXIT_CUT_OFF, cutOffLine, failedJobsOr, verdictOnExit } from "./lib/verdict.ts";
import { fail } from "./lib/tools.ts";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { waitForCi } from "./lib/ci-wait.ts";

const SCRIPT = "ci:wait";
const EXIT_SUCCESS = 0;
const NONE = 0;
const SHORT_SHA = 12;

const verdict = verdictOnExit("arguments");
const { values } = parseArgs({ options: { branch: { type: "string" }, sha: { type: "string" } } });

function head(): string {
  const ran = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  if (ran.status !== EXIT_SUCCESS) {
    return fail(SCRIPT, `git rev-parse HEAD failed: ${ran.stderr}`);
  }
  return ran.stdout.trim();
}

verdict.failingAt("git rev-parse HEAD");
const sha = values.sha ?? head();

function branchFilter(): readonly string[] {
  if (typeof values.branch !== "string") {
    return [];
  }
  return ["--branch", values.branch];
}

verdict.failingAt("waiting for the Check run");
const step = waitForCi({
  args: [...branchFilter(), "--commit", sha],
  log: (line) => {
    console.log(`${SCRIPT}: ${line}`);
  },
  subject: sha.slice(NONE, SHORT_SHA),
});

if (step.kind === "stopped" && step.cutOff === true) {
  verdict.failingAt(cutOffLine(step.jobs));
  fail(SCRIPT, step.reason, EXIT_CUT_OFF);
} else if (step.kind === "stopped") {
  verdict.failingAt(failedJobsOr({ jobs: step.jobs, step: "waiting for the Check run" }));
  fail(SCRIPT, step.reason);
}
