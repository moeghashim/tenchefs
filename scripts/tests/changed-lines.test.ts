import { changedLines, unchangedSince } from "../lib/changed-lines.ts";
import { expect, it, onTestFinished } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";

const VIEW = "view.tsx";
const BEFORE = ["one", "two", "three", "four", "five", "six"];
const NEXT = 1;

function lineOf(word: string): number {
  return BEFORE.indexOf(word) + NEXT;
}

function git(cwd: string, ...args: readonly string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function write(dir: string, lines: readonly string[]): void {
  writeFileSync(path.join(dir, VIEW), `${lines.join("\n")}\n`);
}

function repo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "changed-lines-"));
  onTestFinished(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  git(dir, "init", "-q", "-b", "v1");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  write(dir, BEFORE);
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "first");
  git(dir, "checkout", "-q", "-b", "ticket-7");
  return dir;
}

it("lists the base's lines a branch changed or deleted, and the lines either side of an insertion", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const dir = repo();
  write(dir, ["one", "TWO", "three", "inserted", "four", "six"]);

  expect(changedLines({ base: "v1", cwd: dir, file: VIEW })).toStrictEqual({
    ok: true,
    value: [
      [lineOf("two"), lineOf("two")],
      [lineOf("three"), lineOf("four")],
      [lineOf("five"), lineOf("five")],
    ],
  });
});

it("can't list changed lines for a file git doesn't track", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = repo();

  expect(changedLines({ base: "v1", cwd: dir, file: "new.tsx" })).toStrictEqual({
    ok: false,
    reason: "git shows no changed lines in new.tsx",
  });
});

it("a file is unchanged since a commit only when the branch's base holds it as that commit did", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const dir = repo();
  const mapped = git(dir, "rev-parse", "HEAD");
  git(dir, "checkout", "-q", "v1");
  write(dir, [...BEFORE, "seven"]);
  git(dir, "commit", "-q", "-am", "second");
  git(dir, "checkout", "-q", "ticket-7");
  const before = unchangedSince({ base: "v1", commit: mapped, cwd: dir, file: VIEW });
  git(dir, "merge", "-q", "v1");

  expect([
    before,
    unchangedSince({ base: "v1", commit: mapped, cwd: dir, file: VIEW }),
    unchangedSince({ base: "v1", commit: "0123456789abcdef0123456789abcdef01234567", cwd: dir, file: VIEW }),
  ]).toStrictEqual([true, false, false]);
});
