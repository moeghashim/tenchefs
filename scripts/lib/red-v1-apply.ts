import type { Action, V1Run } from "./red-v1.ts";
import { closeComment, conflictComment, issueBody, issueTitle, revertedComment } from "./red-v1-issue.ts";
import { described, failuresOf } from "./ci-failures.ts";
import { readCheckRun, redJobs } from "./check-run.ts";
import type { Command } from "./merge-steps.ts";
import type { Commit } from "./red-v1-issue.ts";
import type { Outcome } from "./tools.ts";
import { ran } from "./red-v1-read.ts";
import { revertAtOf } from "./red-v1.ts";
import { revertV1 } from "./red-v1-revert.ts";

interface Applying {
  readonly commits: readonly Commit[];
  readonly cwd: string;
  readonly dryRun: boolean;
  readonly gh: Command;
  readonly git: Command;
  readonly log: (line: string) => void;
}

interface Acting {
  readonly args: readonly string[];
  readonly what: string;
}

interface Commenting {
  readonly body: string;
  readonly number: number;
}

interface Failed {
  readonly details: string;
  readonly jobs: readonly string[];
}

interface ToApply {
  readonly action: Action;
  readonly opened: number | null;
}

type Open = Extract<Action, { readonly kind: "open" }>;
type Revert = Extract<Action, { readonly kind: "revert" }>;
type Close = Extract<Action, { readonly kind: "close" }>;

const OK: Outcome<null> = { ok: true, value: null };
const ISSUES = "repos/{owner}/{repo}/issues";
const NO_NUMBER = 0;
const COMMAND_WORDS = 2;
const START = 0;

function act(applying: Applying, { args, what }: Acting): Outcome<string> {
  if (applying.dryRun) {
    applying.log(`would ${what}: gh ${args.slice(START, COMMAND_WORDS).join(" ")}`);
    return { ok: true, value: "" };
  }
  applying.log(what);
  return ran({ args, command: applying.gh, cwd: applying.cwd });
}

function done(outcome: Outcome<string>): Outcome<null> {
  if (!outcome.ok) {
    return outcome;
  }
  return OK;
}

function comment(applying: Applying, { body, number }: Commenting): Outcome<null> {
  const on = `#${String(number)}`;
  applying.log(`comment on ${on}:\n${body}`);
  const args = ["api", `${ISSUES}/${String(number)}/comments`, "--raw-field", `body=${body}`];
  return done(act(applying, { args, what: `comment on ${on}` }));
}

function commitOf(applying: Applying, sha: string): Commit {
  return applying.commits.find((commit) => commit.sha === sha) ?? { sha, subject: "" };
}

function numberOf(output: string): number | null {
  const number = Number(output.trim());
  if (Number.isInteger(number) && number > NO_NUMBER) {
    return number;
  }
  return null;
}

function pullRequestOf(applying: Applying, sha: string): number | null {
  const args = ["api", `repos/{owner}/{repo}/commits/${sha}/pulls`, "--jq", ".[0].number // empty"];
  const pulls = ran({ args, command: applying.gh, cwd: applying.cwd });
  if (!pulls.ok) {
    return null;
  }
  return numberOf(pulls.value);
}

function failedJobsOf(applying: Applying, redRun: V1Run): Failed {
  const checkRun = readCheckRun({ cwd: applying.cwd, gh: applying.gh, runNumber: redRun.run });
  if (checkRun.kind === "unreadable") {
    return { details: checkRun.output, jobs: [] };
  }
  const failures = failuresOf({ ...applying, jobs: redJobs(checkRun), runNumber: redRun.run });
  return {
    details: failures.map((failure) => described(failure)).join("\n"),
    jobs: failures.map(({ job }) => job.name),
  };
}

function open(applying: Applying, action: Open): Outcome<number | null> {
  const failed = failedJobsOf(applying, action.redRun);
  const facts = {
    details: failed.details,
    failedJobs: failed.jobs,
    firstRed: commitOf(applying, action.firstRed),
    newestGreen: action.newestGreen,
    pullRequest: pullRequestOf(applying, action.firstRed),
    redRun: action.redRun,
    revertAt: revertAtOf(action.redRun),
    since: action.since.map((sha) => commitOf(applying, sha)),
  };
  const title = issueTitle(facts);
  const body = issueBody(facts);
  applying.log(`open the fix-forward issue "${title}":\n${body}`);
  const args = ["api", ISSUES, "--raw-field", `title=${title}`, "--raw-field", `body=${body}`, "--jq", ".number"];
  const created = act(applying, { args, what: "open the fix-forward issue" });
  if (!created.ok) {
    return created;
  }
  return { ok: true, value: numberOf(created.value) };
}

function close(applying: Applying, { green, issue }: Close): Outcome<null> {
  const commented = comment(applying, { body: closeComment(green), number: issue });
  if (!commented.ok) {
    return commented;
  }
  const args = [
    "api",
    "-X",
    "PATCH",
    `${ISSUES}/${String(issue)}`,
    "-f",
    "state=closed",
    "-f",
    "state_reason=completed",
  ];
  return done(act(applying, { args, what: `close #${String(issue)}` }));
}

function commentAll(applying: Applying, numbers: readonly (number | null)[], body: string): Outcome<null> {
  for (const number of numbers) {
    if (number !== null) {
      const commented = comment(applying, { body, number });
      if (!commented.ok) {
        return commented;
      }
    }
  }
  return OK;
}

function afterPush(applying: Applying, { action, opened: issue }: ToApply, revertSha: string): Outcome<null> {
  const checked = act(applying, { args: ["workflow", "run", "check.yml", "--ref", "v1"], what: "run Check on v1" });
  if (!checked.ok || action.kind !== "revert") {
    return done(checked);
  }
  const body = revertedComment({ sha: action.sha, what: revertSha });
  return commentAll(applying, [issue, pullRequestOf(applying, action.sha)], body);
}

function conflicted(
  applying: Applying,
  { issue, sha }: { readonly issue: number | null; readonly sha: string },
  output: string,
): Outcome<null> {
  applying.log(`the revert of ${sha} conflicts: nothing pushed`);
  return commentAll(applying, [issue], conflictComment({ sha, what: output }));
}

function wouldRevert(applying: Applying, { sha }: Revert): Outcome<null> {
  applying.log(`would revert ${sha} (${commitOf(applying, sha).subject}) on v1, push it and run Check on v1`);
  return OK;
}

function revert(applying: Applying, action: Revert, issue: number | null): Outcome<null> {
  if (applying.dryRun) {
    return wouldRevert(applying, action);
  }
  const reverted = revertV1({ cwd: applying.cwd, git: applying.git, sha: action.sha });
  if (reverted.kind === "refused") {
    return {
      ok: false,
      reason: `could not push the revert of ${action.sha}; the next run tries again:\n${reverted.output}`,
    };
  }
  if (reverted.kind === "conflict") {
    return conflicted(applying, { issue, sha: action.sha }, reverted.output);
  }
  applying.log(`reverted ${action.sha} on v1 by ${reverted.revert}`);
  return afterPush(applying, { action, opened: issue }, reverted.revert);
}

function kept(outcome: Outcome<null>, opened: number | null): Outcome<number | null> {
  if (!outcome.ok) {
    return outcome;
  }
  return { ok: true, value: opened };
}

function rerun(applying: Applying, run: V1Run): Outcome<null> {
  const args = ["run", "rerun", String(run.run), "--failed"];
  return done(act(applying, { args, what: `rerun Check run ${String(run.run)}'s failed jobs` }));
}

function applyAction(applying: Applying, { action, opened }: ToApply): Outcome<number | null> {
  if (action.kind === "open") {
    return open(applying, action);
  }
  if (action.kind === "rerun") {
    return kept(rerun(applying, action.run), opened);
  }
  if (action.kind === "close") {
    return kept(close(applying, action), opened);
  }
  return kept(revert(applying, action, action.issue ?? opened), opened);
}

function applyRedV1({
  actions,
  applying,
}: {
  readonly actions: readonly Action[];
  readonly applying: Applying;
}): Outcome<null> {
  let opened: number | null = null;
  for (const action of actions) {
    const applied = applyAction(applying, { action, opened });
    if (!applied.ok) {
      return applied;
    }
    opened = applied.value;
  }
  return OK;
}

export { applyRedV1 };
