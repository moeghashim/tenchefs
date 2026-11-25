import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { expect, it, onTestFinished } from "vitest";
import path from "node:path";
import { tmpdir } from "node:os";

const SCRIPT = path.resolve("scripts/coverage-changed.ts");
const SETUP = [
  ["init", "-q", "-b", "ticket-7"],
  ["config", "user.email", "test@example.com"],
  ["config", "user.name", "Test"],
  ["add", "."],
  ["commit", "-q", "-m", "first"],
  ["update-ref", "refs/remotes/origin/v1", "HEAD"],
] as const;
const LAST = -1;
const PASSED = 0;
const FAILED = 1;
const EXECUTABLE = 0o755;
const WITH_TMPDIR = 'TMPDIR="$0" exec node "$1"';
const VITEST = `#!/usr/bin/env node
const fs = require("node:fs");
const flag = "--coverage.reportsDirectory=";
const dir = process.argv.find((arg) => arg.startsWith(flag)).slice(flag.length);
fs.writeFileSync(dir + "/coverage-final.json", "{}");
`;

interface Ran {
  readonly last: string;
  readonly status: number | null;
}

function repo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "coverage-changed-"));
  onTestFinished(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  writeFileSync(path.join(dir, "README.md"), "hi\n");
  writeFileSync(path.join(dir, ".gitignore"), "node_modules/\nlocks/\n");
  for (const args of SETUP) {
    execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  }
  return dir;
}

function withVitest(dir: string): string {
  const bin = path.join(dir, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, "vitest"), VITEST);
  chmodSync(path.join(bin, "vitest"), EXECUTABLE);
  return dir;
}

function coverageChanged(dir: string): Ran {
  const locks = path.join(dir, "locks");
  mkdirSync(locks);
  const ran = spawnSync("sh", ["-c", WITH_TMPDIR, locks, SCRIPT], { cwd: dir, encoding: "utf8" });
  return { last: ran.stdout.trimEnd().split("\n").at(LAST) ?? "", status: ran.status };
}

it("ends with RESULT: PASS when every changed line is covered", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const dir = withVitest(repo());

  expect(coverageChanged(dir)).toStrictEqual({ last: "RESULT: PASS", status: PASSED });
});

it("ends with RESULT: FAIL naming the tests when they fail", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  expect(coverageChanged(repo())).toStrictEqual({ last: "RESULT: FAIL (tests)", status: FAILED });
});
