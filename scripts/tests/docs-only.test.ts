import { expect, it, onTestFinished } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { docsOnlySkip } from "../lib/docs-only.ts";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";

const SETUP = [
  ["init", "-q", "-b", "v1"],
  ["config", "user.email", "test@example.com"],
  ["config", "user.name", "Test"],
  ["add", "."],
  ["commit", "-q", "-m", "first"],
  ["checkout", "-q", "-b", "ticket-7"],
] as const;

const SKIP_LINE =
  "check: skipping the tests and browser jobs, since every changed file is docs (*.md, docs/, .changeset/). CI still runs them.";

function git(cwd: string, ...args: readonly string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function write(dir: string, files: readonly string[]): void {
  for (const file of files) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), `${file}\n`);
  }
}

function branchRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "docs-only-"));
  onTestFinished(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  write(dir, ["README.md", "src/app.ts"]);
  for (const args of SETUP) {
    git(dir, ...args);
  }
  return dir;
}

it("skips the tests when every changed file is docs", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = branchRepo();
  write(dir, ["README.md", "docs/adr/0001-a.md", "docs/diagram.svg", ".changeset/quiet-fox.md", "src/notes.md"]);

  expect(docsOnlySkip({ base: "v1", cwd: dir })).toStrictEqual({ line: SKIP_LINE, skip: true });
});

it("runs the tests when any changed file is code", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = branchRepo();
  write(dir, ["README.md", "src/app.ts"]);

  expect(docsOnlySkip({ base: "v1", cwd: dir })).toStrictEqual({ line: "", skip: false });
});

it("runs the tests when a docs change deletes a code file", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = branchRepo();
  write(dir, ["README.md"]);
  git(dir, "rm", "-q", "src/app.ts");

  expect(docsOnlySkip({ base: "v1", cwd: dir })).toStrictEqual({ line: "", skip: false });
});

it("runs the tests when nothing changed or the base is unknown", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = branchRepo();

  expect([docsOnlySkip({ base: "v1", cwd: dir }), docsOnlySkip({ base: "nowhere", cwd: dir })]).toStrictEqual([
    { line: "", skip: false },
    { line: "", skip: false },
  ]);
});
