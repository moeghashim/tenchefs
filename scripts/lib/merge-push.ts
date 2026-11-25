import { DONE, firstStop, git, lines, stop, tail } from "./merge-steps.ts";
import type { Landed, Landing, PullRequest } from "./merge-pull-request.ts";
import type { Step, Stopped } from "./merge-steps.ts";
import { titleOf } from "./merge-branch.ts";

interface PushOptions {
  readonly ci: (branch: string, sha: string) => Step;
  readonly cwd: string;
  readonly log: (line: string) => void;
  readonly pullRequest: (landing: Landing) => PullRequest | Stopped;
  readonly ticket: number;
  readonly title: string;
}

type Attempt = Landed | { readonly kind: "moved" } | Stopped;

const NONE = 0;
const NEXT = 1;
const SHORT = 12;
const HEADS = "refs/heads/";

function branchOf(options: Pick<PushOptions, "ticket">): string {
  return `merge-ticket-${options.ticket}`;
}

function attemptBranchOf(options: Pick<PushOptions, "ticket">, sha: string): string {
  return `${branchOf(options)}-${sha.slice(NONE, SHORT)}`;
}

function remoteBranches(options: PushOptions): readonly string[] {
  const branch = branchOf(options);
  const listed = git(options, "ls-remote", "--heads", "origin", branch, `${branch}-*`);
  return lines(listed.output).flatMap((line) => {
    const ref = line.split("\t").at(NEXT) ?? "";
    return [ref.slice(HEADS.length)].filter(() => ref.startsWith(HEADS));
  });
}

function deleteRemoteBranches(options: PushOptions, keep: string): void {
  for (const branch of remoteBranches(options).filter((name) => name !== keep)) {
    git(options, "push", "-q", "origin", "--delete", branch);
  }
}

function deleteRemoteBranch(options: PushOptions): void {
  deleteRemoteBranches(options, "");
}

function pushBranch(options: PushOptions, sha: string): Step {
  const branch = attemptBranchOf(options, sha);
  if (remoteBranches(options).includes(branch)) {
    options.log(
      `${branch} is already on origin: not pushing again. If its Check run is red, its failed jobs are rerun once, in case they were flaky.`,
    );
    return DONE;
  }
  deleteRemoteBranches(options, branch);
  const pushed = git(options, "push", "-q", "origin", `${sha}:${HEADS}${branch}`);
  if (!pushed.ok) {
    return stop(`git push origin ${sha}:${branch} failed; nothing was pushed to v1.\n${tail(pushed.output)}`);
  }
  options.log(`Pushed ${branch} at ${sha}.`);
  return DONE;
}

function adviceOn(options: PushOptions, watched: Stopped): string {
  const branch = branchOf(options);
  const resume = `run pnpm merge-ticket ${options.ticket} --continue`;
  if (watched.cutOff === true) {
    return `The merge is on ${branch}: a rerun would hit the same limit, so make the job fit it, commit, then ${resume}.`;
  }
  if (watched.jobs.length === NONE) {
    return `The merge is on ${branch}: fix what stopped it, commit any change there, then ${resume}, which first merges a moved v1 into it.`;
  }
  return `The merge is on ${branch}: its failed jobs were rerun once, so fix it there and commit, then ${resume}.`;
}

function nothingPushed(options: PushOptions, stopped: Stopped, on: string): Stopped {
  return { ...stopped, reason: `${stopped.reason}\n${on}\nNothing was pushed to v1. ${adviceOn(options, stopped)}` };
}

function greenOnCi(options: PushOptions, sha: string): Step {
  const branch = attemptBranchOf(options, sha);
  options.log(`Waiting for ${branch}'s Check run before fast-forwarding v1 to ${sha}.`);
  const watched = options.ci(branch, sha);
  if (watched.kind === "stopped") {
    return nothingPushed(options, watched, `That Check run was on ${branch} at ${sha}.`);
  }
  return DONE;
}

function openedPullRequest(options: PushOptions, sha: string): Step {
  const opened = options.pullRequest({ branch: attemptBranchOf(options, sha), sha, title: titleOf(options) });
  if ("kind" in opened) {
    return nothingPushed(options, opened, `${attemptBranchOf(options, sha)} is on origin at ${sha}.`);
  }
  return DONE;
}

function fastForwardV1(options: PushOptions, sha: string): Attempt {
  const pushed = git(options, "push", "-q", "origin", `${sha}:${HEADS}v1`);
  if (pushed.ok) {
    options.log(`Fast-forwarded v1 to ${sha}, whose Check run is green.`);
    return { kind: "landed", sha };
  }
  git(options, "fetch", "-q", "origin");
  if (git(options, "merge-base", "--is-ancestor", "origin/v1", sha).ok) {
    return stop(`git push origin ${sha}:${HEADS}v1 failed, though v1 has not moved.\n${tail(pushed.output)}`);
  }
  return { kind: "moved" };
}

function push({ options }: { readonly options: PushOptions }): Attempt {
  const sha = git(options, "rev-parse", "HEAD").output;
  const ready = firstStop([
    (): Step => pushBranch(options, sha),
    (): Step => openedPullRequest(options, sha),
    (): Step => greenOnCi(options, sha),
  ]);
  if (ready.kind === "stopped") {
    return ready;
  }
  return fastForwardV1(options, sha);
}

export type { Attempt, PushOptions };
export { branchOf, deleteRemoteBranch, push };
