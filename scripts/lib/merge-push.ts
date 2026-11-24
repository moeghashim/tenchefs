import { DONE, git, stop, tail } from "./merge-steps.ts";
import type { Step, Stopped } from "./merge-steps.ts";

interface PushOptions {
  readonly ci: (branch: string, sha: string, rerunRed: boolean) => Step;
  readonly cwd: string;
  readonly log: (line: string) => void;
  readonly ticket: number;
}

interface Pushed {
  readonly kind: "pushed";
  readonly sha: string;
}

type Attempt = { readonly kind: "moved" } | Pushed | Stopped;

function branchOf(options: PushOptions): string {
  return `merge-ticket-${options.ticket}`;
}

function deleteRemoteBranch(options: PushOptions): void {
  const branch = branchOf(options);
  if (git(options, "ls-remote", "--exit-code", "--heads", "origin", branch).ok) {
    git(options, "push", "-q", "origin", "--delete", branch);
  }
}

function onOrigin(options: PushOptions, sha: string): boolean {
  const listed = git(options, "ls-remote", "--heads", "origin", branchOf(options));
  return listed.ok && listed.output.startsWith(`${sha}\t`);
}

function pushBranch(
  options: PushOptions,
  { sha, unchanged }: { readonly sha: string; readonly unchanged: boolean },
): Step {
  const branch = branchOf(options);
  if (unchanged) {
    options.log(
      `${branch} is already at ${sha} on origin: waiting for its existing Check run, not pushing again. If that run is red, its failed jobs are rerun once, in case they were flaky.`,
    );
    return DONE;
  }
  deleteRemoteBranch(options);
  const pushed = git(options, "push", "-q", "origin", `${sha}:refs/heads/${branch}`);
  if (!pushed.ok) {
    return stop(`git push origin ${sha}:${branch} failed; nothing was pushed to v1.\n${tail(pushed.output)}`);
  }
  options.log(`Pushed ${branch} at ${sha}: waiting for its Check run`);
  return DONE;
}

function greenOnCi(options: PushOptions, sha: string): Step {
  const branch = branchOf(options);
  const unchanged = onOrigin(options, sha);
  const pushed = pushBranch(options, { sha, unchanged });
  if (pushed.kind === "stopped") {
    return pushed;
  }
  const watched = options.ci(branch, sha, unchanged);
  if (watched.kind === "stopped") {
    return stop(
      `${watched.reason}\nNothing was pushed to v1. The merge is on ${branch}: fix it there and commit, then run pnpm merge-ticket ${options.ticket} --continue. If the failure looks flaky, run --continue without a new commit: it reruns the failed jobs once.`,
      ...watched.files,
    );
  }
  return DONE;
}

function fastForwardV1(options: PushOptions, { base, sha }: { readonly base: string; readonly sha: string }): Attempt {
  const pushed = git(options, "push", "-q", "origin", `${sha}:refs/heads/v1`);
  if (pushed.ok) {
    return { kind: "pushed", sha };
  }
  git(options, "fetch", "-q", "origin");
  if (git(options, "rev-parse", "origin/v1").output === base) {
    return stop(`git push origin ${sha}:v1 failed.\n${tail(pushed.output)}`);
  }
  return { kind: "moved" };
}

function push({ base, options }: { readonly base: string; readonly options: PushOptions }): Attempt {
  const sha = git(options, "rev-parse", "HEAD").output;
  const watched = greenOnCi(options, sha);
  if (watched.kind === "stopped") {
    return watched;
  }
  return fastForwardV1(options, { base, sha });
}

export type { Attempt, PushOptions, Pushed };
export { branchOf, deleteRemoteBranch, push };
