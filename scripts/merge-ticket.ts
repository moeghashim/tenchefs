import type { MergeOptions, Merged } from "./lib/merge-ticket.ts";
import { continueMerge, mergeTicket } from "./lib/merge-ticket.ts";
import { failedJobsOr, mergedLine, verdictOnExit } from "./lib/verdict.ts";
import type { Step } from "./lib/merge-steps.ts";
import { fail } from "./lib/tools.ts";
import { mergeRules } from "./lib/merge-rules.ts";
import { spawnSync } from "node:child_process";
import { waitForCi } from "./lib/ci-wait.ts";

const SCRIPT = "merge-ticket";
const verdict = verdictOnExit("usage");
const ATTEMPTS = 5;
const NONE = 0;
const EXIT_SUCCESS = 0;
const ARGUMENT = 2;
const argument = process.argv.at(ARGUMENT) ?? "";
const resuming = process.argv.includes("--continue");
const fixesRedV1 = process.argv.includes("--fixes-red-v1");
const reordersUndeployed = process.argv.includes("--reorders-undeployed-migrations");

function titleOf(ticket: number): string {
  const issue = spawnSync("gh", ["issue", "view", String(ticket), "--json", "title", "--jq", ".title"], {
    encoding: "utf8",
  });
  if (issue.status !== EXIT_SUCCESS) {
    return fail(SCRIPT, `gh issue view ${ticket} failed: ${issue.stderr}`);
  }
  return issue.stdout.trim();
}

const ticket = Number(argument);
if (!Number.isInteger(ticket) || ticket <= NONE) {
  fail(
    SCRIPT,
    "usage: pnpm merge-ticket <N> [--continue] [--fixes-red-v1] [--reorders-undeployed-migrations], where ticket-N is a local branch.",
  );
}

function run(options: MergeOptions): Merged {
  if (resuming) {
    return continueMerge(options);
  }
  return mergeTicket(options);
}

function log(line: string): void {
  console.log(`${SCRIPT}: ${line}`);
}

interface Gate {
  readonly advice: string;
  readonly args: readonly string[];
  readonly base: readonly string[];
  readonly rerunRed: boolean;
  readonly subject: string;
  readonly vouchedBy: string;
}

function requireGreen(gate: Gate): void {
  const { advice, subject } = gate;
  verdict.failingAt(`${subject}'s Check run`);
  const step = waitForCi({ ...gate, log });
  if (step.kind === "stopped") {
    verdict.failingAt(`${subject}'s Check run: ${failedJobsOr({ jobs: step.jobs, step: "not green" })}`);
    fail(SCRIPT, `${step.reason}\nNothing was merged. ${advice}`);
  }
}

function gitOutput(...args: readonly string[]): string {
  const ran = spawnSync("git", args, { encoding: "utf8" });
  if (ran.status !== EXIT_SUCCESS) {
    return fail(SCRIPT, `git ${args.join(" ")} failed: ${ran.stderr}`);
  }
  return ran.stdout.trim();
}

if (fixesRedV1) {
  log(
    "WARNING: --fixes-red-v1 skips the check of v1's latest Check run. Use it only for the ticket that fixes a red v1.",
  );
} else {
  requireGreen({
    advice: `If ticket-${ticket} is the fix for that red, run pnpm merge-ticket ${ticket} --fixes-red-v1.`,
    args: ["--branch", "v1"],
    base: [],
    rerunRed: false,
    subject: "v1",
    vouchedBy: "merge-ticket-",
  });
}
requireGreen({
  advice: `A red ticket-${ticket} run's failed jobs are rerun once, by a fresh run or --continue alike. If they failed again, fix ticket-${ticket}, push it and wait until every job of its Check run passes.`,
  args: ["--branch", `ticket-${ticket}`, "--commit", gitOutput("rev-parse", `ticket-${ticket}`)],
  base: ["--branch", "v1", "--commit", gitOutput("merge-base", `ticket-${ticket}`, "origin/v1")],
  rerunRed: true,
  subject: `ticket-${ticket}`,
  vouchedBy: "",
});

function migrationsBase(): string {
  verdict.failingAt("migrations base");
  if (!reordersUndeployed) {
    return "origin/v1";
  }
  const [tag = ""] = gitOutput("tag", "--list", "deploy/*", "--merged", "origin/v1", "--sort=-creatordate").split("\n");
  if (tag === "") {
    return fail(
      SCRIPT,
      "found no deploy/* tag on origin/v1 to compare the migrations list with. Run git fetch --tags.",
    );
  }
  log(
    `WARNING: --reorders-undeployed-migrations compares the migrations list with ${tag}'s, not v1's. Use it only for the ticket that moves a migration production hasn't run.`,
  );
  return tag;
}

const FAST_CHECKS = ["typecheck", "lint --base=origin/v1", "hygiene"]
  .map((script) => `pnpm run --silent ${script}`)
  .join(" && ");

function ciOf(branch: string, sha: string, rerunRed: boolean): Step {
  return waitForCi({ args: ["--branch", branch, "--commit", sha], base: [], log, rerunRed, subject: branch });
}

function failedStepOf(files: readonly string[]): string {
  if (files.length === NONE) {
    return "merge";
  }
  return `conflict in ${files.join(", ")}`;
}

verdict.failingAt("gh issue view");
const merged: Merged = run({
  attempts: ATTEMPTS,
  check: ["sh", "-c", FAST_CHECKS],
  ci: ciOf,
  cwd: process.cwd(),
  install: ["pnpm", "install", "--frozen-lockfile"],
  log,
  migrationsBase: migrationsBase(),
  rules: mergeRules,
  ticket,
  title: titleOf(ticket),
});

function shaOf(outcome: Merged): string {
  if (outcome.ok) {
    return outcome.sha;
  }
  verdict.failingAt(failedStepOf(outcome.files));
  return fail(SCRIPT, outcome.reason);
}

const sha = shaOf(merged);
console.log(`${SCRIPT}: merged ticket-${ticket} into v1 at ${sha}, whose merge-ticket-${ticket} Check run is green.`);
console.log(sha);
verdict.succeedWith(mergedLine(sha));
