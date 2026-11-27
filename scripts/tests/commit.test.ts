import { expect, it, onTestFinished } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const SCRIPT = path.resolve("scripts/commit.sh");
const FAILED = 1;
const PASSED = 0;

interface Run {
  readonly status: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

function git(cwd: string, ...args: readonly string[]): Run {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function commit(cwd: string, ...args: readonly string[]): Run {
  return spawnSync(SCRIPT, args, { cwd, encoding: "utf8" });
}

function repo(): string {
  const work = mkdtempSync(path.join(tmpdir(), "commit-"));
  onTestFinished(() => {
    rmSync(work, { force: true, recursive: true });
  });
  writeFileSync(path.join(work, "a.txt"), "a\n");
  const setup = [
    ["init", "--quiet"],
    ["config", "user.email", "test@example.com"],
    ["config", "user.name", "Test"],
    ["add", "a.txt"],
    ["commit", "--quiet", "-m", "first"],
  ];
  for (const args of setup) {
    git(work, ...args);
  }
  writeFileSync(path.join(work, "a.txt"), "changed\n");
  return work;
}

it("a commit with nothing staged fails and says to run git add", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const run = commit(repo(), "-m", "nothing staged");

  expect(run.status).toBe(FAILED);
  expect(run.stderr).toBe("nothing staged: run git add first\n");
});

it("a commit with something staged is made", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const work = repo();
  git(work, "add", "a.txt");

  expect(commit(work, "--quiet", "-m", "staged").status).toBe(PASSED);
  expect(git(work, "diff", "HEAD", "--quiet").status).toBe(PASSED);
});

it("an amend, an allowed empty commit or a commit of every change may stage nothing", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const work = repo();

  expect(commit(work, "--quiet", "--amend", "-m", "reworded").status).toBe(PASSED);
  expect(commit(work, "--quiet", "--allow-empty", "-m", "empty").status).toBe(PASSED);
  expect(commit(work, "--quiet", "-a", "-m", "everything").status).toBe(PASSED);
});

function clone(origin: string): string {
  const work = mkdtempSync(path.join(tmpdir(), "commit-clone-"));
  onTestFinished(() => {
    rmSync(work, { force: true, recursive: true });
  });
  git(tmpdir(), "clone", "--quiet", "--branch", "v1", origin, work);
  git(work, "config", "user.email", "test@example.com");
  git(work, "config", "user.name", "Test");
  return work;
}

function change(work: string, file: string, message: string): void {
  writeFileSync(path.join(work, file), `${message}\n`);
  git(work, "add", file);
  git(work, "commit", "--quiet", "-m", message);
}

function short(work: string, revision: string): string {
  return git(work, "rev-parse", "--short", revision).stdout.trim();
}

interface Clones {
  readonly work: string;
  readonly other: string;
}

function branchCutFromV1(): Clones {
  const origin = mkdtempSync(path.join(tmpdir(), "commit-origin-"));
  onTestFinished(() => {
    rmSync(origin, { force: true, recursive: true });
  });
  git(origin, "init", "--quiet", "--bare", "--initial-branch", "v1");
  const seed = repo();
  git(seed, "branch", "-M", "v1");
  git(seed, "push", "--quiet", origin, "v1");
  const work = clone(origin);
  git(work, "checkout", "--quiet", "-b", "ticket-1");
  return { other: clone(origin), work };
}

function landOnV1(other: string, ...changes: readonly (readonly [file: string, message: string])[]): void {
  for (const [file, message] of changes) {
    change(other, file, message);
  }
  git(other, "push", "--quiet", "origin", "v1");
}

function stage(work: string, ...files: readonly string[]): void {
  for (const file of files) {
    writeFileSync(path.join(work, file), "branch\n");
  }
  git(work, "add", ...files);
}

function landTicketTwo(other: string): void {
  git(other, "checkout", "--quiet", "-b", "ticket-2");
  change(other, "a.txt", "Ticket 2 first");
  change(other, "b.txt", "Ticket 2 second");
  git(other, "checkout", "--quiet", "v1");
  change(other, "c.txt", "Add c on v1");
  git(other, "merge", "--quiet", "--no-ff", "-m", "Merge ticket-2", "ticket-2");
}

it("a commit warns, naming the commits and files, when origin/v1 has new commits touching the branch's files", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { work, other } = branchCutFromV1();
  landOnV1(other, ["a.txt", "Rework a on v1"], ["b.txt", "Add b on v1"]);
  stage(work, "a.txt");

  const run = commit(work, "--quiet", "-m", "branch work");

  expect(run.status).toBe(PASSED);
  expect(run.stderr).toBe(
    [
      "warning: origin/v1 has 1 new commit touching files this branch changes; read it before you go on (landing will merge it in):",
      `  ${short(other, "HEAD~1")} Rework a on v1: a.txt`,
      "",
    ].join("\n"),
  );
});

it("a commit says nothing when origin/v1's new commits touch only other files", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { work, other } = branchCutFromV1();
  landOnV1(other, ["b.txt", "Add b on v1"]);
  stage(work, "a.txt");

  const run = commit(work, "--quiet", "-m", "branch work");

  expect(run.status).toBe(PASSED);
  expect(run.stderr).toBe("");
});

it("a commit the hook refuses still warns, and keeps the hook's exit code", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { work, other } = branchCutFromV1();
  landOnV1(other, ["a.txt", "Rework a on v1"]);
  writeFileSync(path.join(work, ".git", "hooks", "pre-commit"), "#!/bin/sh\nexit 3\n", { mode: 0o755 });
  stage(work, "a.txt");

  const run = commit(work, "--quiet", "-m", "refused");

  expect(run.status).toBe(FAILED);
  expect(run.stderr).toContain("Rework a on v1: a.txt");
});

it("a ticket merged into origin/v1 shows as its one merge commit, beside v1's own commits", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { work, other } = branchCutFromV1();
  landTicketTwo(other);
  landOnV1(other, ["a.txt", "Rework a on v1"]);
  stage(work, "a.txt", "b.txt");

  expect(commit(work, "--quiet", "-m", "branch work").stderr).toBe(
    [
      "warning: origin/v1 has 2 new commits touching files this branch changes; read them before you go on (landing will merge them in):",
      `  ${short(other, "HEAD~1")} Merge ticket-2: a.txt, b.txt`,
      `  ${short(other, "HEAD")} Rework a on v1: a.txt`,
      "",
    ].join("\n"),
  );
});
