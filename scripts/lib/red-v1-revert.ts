import type { Command } from "./merge-steps.ts";
import { run } from "./merge-steps.ts";

interface Reverting {
  readonly cwd: string;
  readonly git: Command;
  readonly sha: string;
}

type Reverted =
  | { readonly kind: "pushed"; readonly revert: string }
  | { readonly kind: "conflict"; readonly output: string }
  | { readonly kind: "refused"; readonly output: string };

const BRANCH = "v1";
const MERGE_PARENTS = 2;
const COMMIT_ITSELF = 1;

function git({ cwd, git: command }: Reverting, args: readonly string[]): ReturnType<typeof run> {
  return run(cwd, ...command, ...args);
}

function mainline(reverting: Reverting): readonly string[] {
  const parents = git(reverting, ["rev-list", "--parents", "-n", "1", reverting.sha]);
  if (parents.output.split(/\s+/u).length - COMMIT_ITSELF >= MERGE_PARENTS) {
    return ["-m", "1"];
  }
  return [];
}

function onV1(reverting: Reverting): Reverted | null {
  for (const args of [
    ["fetch", "--quiet", "origin", BRANCH],
    ["checkout", "--quiet", "--detach", `origin/${BRANCH}`],
  ]) {
    const done = git(reverting, args);
    if (!done.ok) {
      return { kind: "refused", output: done.output };
    }
  }
  return null;
}

function pushed(reverting: Reverting): Reverted {
  const push = git(reverting, ["push", "--quiet", "origin", `HEAD:refs/heads/${BRANCH}`]);
  if (!push.ok) {
    return { kind: "refused", output: push.output };
  }
  return { kind: "pushed", revert: git(reverting, ["rev-parse", "HEAD"]).output };
}

function revertV1(reverting: Reverting): Reverted {
  const refused = onV1(reverting);
  if (refused !== null) {
    return refused;
  }
  const reverted = git(reverting, ["revert", "--no-edit", ...mainline(reverting), reverting.sha]);
  if (!reverted.ok) {
    git(reverting, ["revert", "--abort"]);
    return { kind: "conflict", output: reverted.output };
  }
  return pushed(reverting);
}

export { revertV1 };
