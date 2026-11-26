import { expect, it, onTestFinished } from "vitest";
import { localStageTimes, readStageLog, timedStage } from "../lib/stage-log.ts";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const COMMIT = path.resolve("scripts/commit.sh");
const PASSED = 0;
const FAILED = 1;
const CHECK_FAILED = 7;
const TWO_RUNS = 2;
const EXECUTABLE = 0o755;
const LINE = /^\d{4}-\d\d-\d\dT[\d:.]+Z\tpre-commit\t\d+$/u;

function git(cwd: string, ...args: readonly string[]): void {
  spawnSync("git", args, { cwd, encoding: "utf8" });
}

function repo(): string {
  const work = mkdtempSync(path.join(tmpdir(), "stage-log-"));
  onTestFinished(() => {
    rmSync(work, { force: true, recursive: true });
  });
  git(work, "init", "--quiet");
  git(work, "config", "user.email", "test@example.com");
  git(work, "config", "user.name", "Test");
  writeFileSync(path.join(work, "a.txt"), "a\n");
  git(work, "add", "a.txt");
  return work;
}

function commit(cwd: string, ...args: readonly string[]): number | null {
  return spawnSync(COMMIT, args, { cwd, encoding: "utf8" }).status;
}

function unwritableLog(work: string): void {
  mkdirSync(path.join(work, ".git", "stage-times.log"));
}

it("scripts/commit.sh records how long its commit took in the shared stage log", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const work = repo();

  expect(commit(work, "--quiet", "-m", "first")).toBe(PASSED);

  const lines = readFileSync(path.join(work, ".git", "stage-times.log"), "utf8")
    .trim()
    .split("\n");

  expect(lines).toStrictEqual([expect.stringMatching(LINE)]);
});

it("a worktree's commit records in the same log as the main checkout's", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const work = repo();
  commit(work, "--quiet", "-m", "first");
  const tree = path.join(work, "tree");
  git(work, "worktree", "add", "--quiet", "-b", "other", tree);
  writeFileSync(path.join(tree, "b.txt"), "b\n");
  git(tree, "add", "b.txt");

  expect(commit(tree, "--quiet", "-m", "second")).toBe(PASSED);
  expect(localStageTimes({ log: readStageLog(tree), stage: "pre-commit" })).toStrictEqual(
    localStageTimes({ log: readStageLog(work), stage: "pre-commit" }),
  );
  expect(
    readFileSync(path.join(work, ".git", "stage-times.log"), "utf8")
      .trim()
      .split("\n"),
  ).toHaveLength(TWO_RUNS);
});

it("a recording that fails leaves scripts/commit.sh's exit code as it was", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const work = repo();
  unwritableLog(work);

  expect(commit(work, "--quiet", "-m", "first")).toBe(PASSED);

  writeFileSync(path.join(work, "a.txt"), "changed\n");
  git(work, "add", "a.txt");
  writeFileSync(path.join(work, ".git", "hooks", "pre-commit"), "#!/bin/sh\nexit 1\n", { mode: EXECUTABLE });

  expect(commit(work, "--quiet", "-m", "refused by the hook")).toBe(FAILED);
});

it("a local check records its wall time and keeps its exit code", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const work = repo();
  const code = await timedStage({ cwd: work, exit: Promise.resolve(CHECK_FAILED), stage: "pnpm check" });

  expect(code).toBe(CHECK_FAILED);
  expect(localStageTimes({ log: readStageLog(work), stage: "pnpm check" })).toStrictEqual({
    ok: true,
    value: [expect.any(Number)],
  });
});

it("a recording that fails leaves the local check's exit code as it was", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const work = repo();
  unwritableLog(work);

  await expect(timedStage({ cwd: work, exit: Promise.resolve(PASSED), stage: "pnpm check" })).resolves.toBe(PASSED);
  await expect(timedStage({ cwd: work, exit: Promise.resolve(CHECK_FAILED), stage: "pnpm check" })).resolves.toBe(
    CHECK_FAILED,
  );
});

it("a machine with no stage log yet reports it can't read one", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const outside = mkdtempSync(path.join(tmpdir(), "stage-log-none-"));
  onTestFinished(() => {
    rmSync(outside, { force: true, recursive: true });
  });

  expect(readStageLog(repo()).ok).toBe(false);
  expect(readStageLog(outside).ok).toBe(false);
});
