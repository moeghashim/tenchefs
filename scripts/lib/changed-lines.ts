import type { Outcome } from "./tools.ts";
import type { Span } from "./page-coverage.ts";
import { spawnSync } from "node:child_process";

interface FileOnBranch {
  readonly base: string;
  readonly cwd: string;
  readonly file: string;
}

interface FileSince extends FileOnBranch {
  readonly commit: string;
}

const HUNK = /^@@ -(?<start>\d+)(?:,(?<count>\d+))? \+/gmv;
const EXIT_SUCCESS = 0;
const ONE_LINE = "1";
const INSERTION = 0;
const NEXT = 1;
const NONE = 0;

function git(cwd: string, args: readonly string[]): Outcome<string> {
  const ran = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (ran.status !== EXIT_SUCCESS) {
    return { ok: false, reason: `git ${args.join(" ")} failed: ${ran.stderr.trim()}` };
  }
  return { ok: true, value: ran.stdout };
}

function spanOfHunk(start: string, count: string): Span {
  const first = Number(start);
  const lines = Number(count);
  if (lines === INSERTION) {
    return [first, first + NEXT];
  }
  return [first, first + lines - NEXT];
}

function changedLines({ base, cwd, file }: FileOnBranch): Outcome<readonly Span[]> {
  const diffed = git(cwd, ["diff", "-U0", "--no-color", "--merge-base", base, "--", file]);
  if (!diffed.ok) {
    return diffed;
  }
  const spans = Array.from(diffed.value.matchAll(HUNK), ([, start = "", count = ONE_LINE]: readonly string[]) =>
    spanOfHunk(start, count),
  );
  if (spans.length === NONE) {
    return { ok: false, reason: `git shows no changed lines in ${file}` };
  }
  return { ok: true, value: spans };
}

function unchangedSince({ base, commit, cwd, file }: FileSince): boolean {
  const mergeBase = git(cwd, ["merge-base", "HEAD", base]);
  if (!mergeBase.ok) {
    return false;
  }
  const ran = spawnSync("git", ["diff", "--quiet", commit, mergeBase.value.trim(), "--", file], { cwd });
  return ran.status === EXIT_SUCCESS;
}

export { changedLines, unchangedSince };
