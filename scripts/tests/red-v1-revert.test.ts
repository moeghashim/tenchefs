import { expect, it, onTestFinished } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { revertV1 } from "../lib/red-v1-revert.ts";
import { tmpdir } from "node:os";

const IDENTITY = ["-c", "user.name=Test", "-c", "user.email=test@example.com"] as const;
const GIT = ["git", ...IDENTITY] as const;

function git(cwd: string, ...args: readonly string[]): string {
  return execFileSync("git", [...IDENTITY, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function commit(cwd: string, file: string, content: string): string {
  writeFileSync(path.join(cwd, file), content);
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", `write ${file}`);
  return git(cwd, "rev-parse", "HEAD");
}

interface Remote {
  readonly bare: string;
  readonly clone: string;
}

function remote(): Remote {
  const dir = mkdtempSync(path.join(tmpdir(), "red-v1-"));
  onTestFinished(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  const bare = path.join(dir, "origin.git");
  const clone = path.join(dir, "clone");
  git(dir, "init", "-q", "--bare", "-b", "v1", bare);
  git(dir, "clone", "-q", bare, clone);
  git(clone, "checkout", "-q", "-b", "v1");
  commit(clone, "base.txt", "base\n");
  git(clone, "push", "-q", "origin", "v1");
  return { bare, clone };
}

function merged(clone: string, file: string, content: string): string {
  git(clone, "checkout", "-q", "-b", `ticket-${file}`, "v1");
  commit(clone, file, content);
  git(clone, "checkout", "-q", "v1");
  git(clone, "merge", "-q", "--no-ff", "--no-edit", `ticket-${file}`);
  git(clone, "push", "-q", "origin", "v1");
  return git(clone, "rev-parse", "HEAD");
}

it("reverts a merge commit on v1 with -m 1 and pushes it", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { bare, clone } = remote();
  const merge = merged(clone, "red.txt", "red\n");
  const reverted = revertV1({ cwd: clone, git: GIT, sha: merge });

  expect(reverted.kind).toBe("pushed");
  expect(git(bare, "rev-parse", "v1^")).toBe(merge);
  expect(git(bare, "log", "-1", "--format=%B", "v1")).toContain(`This reverts commit ${merge}, reversing`);
  expect(git(bare, "ls-tree", "--name-only", "v1")).toBe("base.txt");
});

it("reverts a commit that isn't a merge with a plain revert", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { bare, clone } = remote();
  const red = commit(clone, "red.txt", "red\n");
  git(clone, "push", "-q", "origin", "v1");

  expect(revertV1({ cwd: clone, git: GIT, sha: red }).kind).toBe("pushed");
  expect(git(bare, "ls-tree", "--name-only", "v1")).toBe("base.txt");
});

it("a revert that conflicts pushes nothing and reports the conflict", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { bare, clone } = remote();
  const merge = merged(clone, "red.txt", "red\n");
  commit(clone, "red.txt", "changed since\n");
  git(clone, "push", "-q", "origin", "v1");
  const before = git(bare, "rev-parse", "v1");
  const reverted = revertV1({ cwd: clone, git: GIT, sha: merge });

  expect(reverted.kind).toBe("conflict");
  expect(git(bare, "rev-parse", "v1")).toBe(before);
  expect(git(clone, "status", "--porcelain")).toBe("");
});
