import { SUITE_LOCK_FILE, holdMachineLock, waitingLine } from "./lib/machine-lock.ts";
import { fail, unwrap } from "./lib/tools.ts";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { Outcome } from "./lib/tools.ts";
import { parseJson } from "./lib/json.ts";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { uncoveredLines } from "./lib/coverage-changed.ts";
import { verdictOnExit } from "./lib/verdict.ts";

const SCRIPT = "coverage:changed";
const BASE = "origin/v1";
const EXIT_SUCCESS = 0;
const NONE = 0;
const MAX_BUFFER = 268_435_456;
const LOCK_POLL_MS = 1000;

function git(...args: readonly string[]): readonly string[] {
  const ran = spawnSync("git", args, { encoding: "utf8", maxBuffer: MAX_BUFFER });
  if (ran.status !== EXIT_SUCCESS) {
    return fail(SCRIPT, `git ${args.join(" ")} failed: ${ran.stderr}`);
  }
  return ran.stdout.split("\n").filter((line) => line.length > NONE);
}

function changedFiles(): readonly string[] {
  return [...git("diff", "--name-only", "--merge-base", BASE), ...git("ls-files", "--others", "--exclude-standard")];
}

function coverageReport(directory: string): Outcome<unknown> {
  const ran = spawnSync(
    "node_modules/.bin/vitest",
    [
      "run",
      "--coverage",
      "--coverage.reporter=json",
      `--coverage.reportsDirectory=${directory}`,
      "--coverage.thresholds.statements=0",
      "--coverage.thresholds.branches=0",
      "--coverage.thresholds.functions=0",
      "--coverage.thresholds.lines=0",
    ],
    { encoding: "utf8", maxBuffer: MAX_BUFFER },
  );
  if (ran.status !== EXIT_SUCCESS) {
    return { ok: false, reason: `the tests failed, so coverage is unknown.\n${ran.stdout}${ran.stderr}` };
  }
  const report = parseJson(readFileSync(path.join(directory, "coverage-final.json"), "utf8"));
  if (typeof report !== "object" || report === null) {
    return { ok: false, reason: "could not read the coverage report." };
  }
  return { ok: true, value: report };
}

const verdict = verdictOnExit("changed files");
const changed = changedFiles();
const directory = mkdtempSync(path.join(tmpdir(), "coverage-changed-"));
const release = await holdMachineLock({
  file: SUITE_LOCK_FILE,
  onWait: (holder) => {
    console.error(waitingLine({ holder, script: SCRIPT }));
  },
  pollMs: LOCK_POLL_MS,
  worktree: process.cwd(),
});
verdict.failingAt("tests");
const report = coverageReport(directory);
release();
rmSync(directory, { force: true, recursive: true });
const coverage = unwrap(SCRIPT, report);
verdict.failingAt("uncovered lines");
const found = uncoveredLines({ changed, coverage, root: process.cwd() });

if (found.length > NONE) {
  console.error(found.join("\n"));
  fail(SCRIPT, `${String(found.length)} uncovered lines in files changed against ${BASE}.`);
}
console.log(`${SCRIPT}: every line of the files changed against ${BASE} is covered.`);
