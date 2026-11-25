import { COMPLETED, RUN, done, ended, ghOnPath, ranFor, view } from "./lib/fake-gh.ts";
import { execFileSync, spawnSync } from "node:child_process";
import { expect, it, onTestFinished } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Responses } from "./lib/fake-gh.ts";
import path from "node:path";
import { tmpdir } from "node:os";

const LAST = -1;
const SETUP = [
  ["init", "-q", "-b", "v1"],
  ["config", "user.email", "test@example.com"],
  ["config", "user.name", "Test"],
  ["add", "a.txt"],
  ["commit", "-q", "-m", "first"],
  ["branch", "ticket-7"],
  ["update-ref", "refs/remotes/origin/v1", "HEAD"],
] as const;
const BUDGET_LOG = "lint\tpnpm check\t::warning title=lint over its time budget::lint took 20.1s, over its 16s budget.";
const BUDGET_WARNED = view({
  jobs: [ended({ conclusion: "failure", failedStep: "pnpm check", name: "lint" }), done("tests")],
  status: COMPLETED,
});
const RED = view({
  jobs: [done("lint"), ended({ conclusion: "failure", failedStep: "pnpm e2e:docker", name: "e2e-docker" })],
  status: COMPLETED,
});

interface Script {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly gh: Responses;
  readonly script: string;
}

interface Ended {
  readonly lastLine: string;
  readonly status: number | null;
}

function ranScript({ args, cwd, gh, script }: Script): Ended {
  const bin = ghOnPath(gh);
  const merged = `PATH="$0:$PATH" node --import "$0/no-sleep.mjs" "$@" 2>&1`;
  const ran = spawnSync("sh", ["-c", merged, bin, path.resolve(script), ...args], { cwd, encoding: "utf8" });
  return { lastLine: ran.stdout.trimEnd().split("\n").at(LAST) ?? "", status: ran.status };
}

function lastLine(script: Script): string {
  return ranScript(script).lastLine;
}

function git(cwd: string, ...args: readonly string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function ticketRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "verdict-"));
  onTestFinished(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  writeFileSync(path.join(dir, "a.txt"), "a\n");
  for (const args of SETUP) {
    git(dir, ...args);
  }
  return dir;
}

it("ends ci:wait with a pass verdict after a time budget warning", { timeout: 20_000 }, () => {
  expect.hasAssertions();

  const gh = { list: [RUN], log: [BUDGET_LOG], view: [BUDGET_WARNED] };

  expect(lastLine({ args: ["--sha", "abc"], cwd: tmpdir(), gh, script: "scripts/ci-wait.ts" })).toBe("RESULT: PASS");
});

it("ends ci:wait with a fail verdict naming the failed jobs", { timeout: 20_000 }, () => {
  expect.hasAssertions();

  const gh = { list: [RUN], log: ["e2e-docker\tpnpm e2e:docker\tboom"], view: [RED] };

  expect(lastLine({ args: ["--sha", "abc"], cwd: tmpdir(), gh, script: "scripts/ci-wait.ts" })).toBe(
    "RESULT: FAIL (e2e-docker)",
  );
});

const CUT_OFF_EXIT = 3;
const LIMIT_MINUTES = 5;
const LIMITED_WORKFLOW = `jobs:\n  browser:\n    name: browser \${{ matrix.shard }}/3\n    timeout-minutes: 5\n`;

function workflowDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "cut-off-"));
  onTestFinished(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true });
  writeFileSync(path.join(dir, ".github", "workflows", "check.yml"), LIMITED_WORKFLOW);
  return dir;
}

it("ends ci:wait with its own exit code when a job was cut off at its time limit", { timeout: 20_000 }, () => {
  expect.hasAssertions();

  const job = ended({ conclusion: "cancelled", failedStep: "pnpm check", name: "browser 1/3" });
  const cut = ranFor({ job, minutes: LIMIT_MINUTES });
  const gh = { list: [RUN], view: [view({ jobs: [done("lint"), cut], status: COMPLETED })] };

  expect(ranScript({ args: ["--sha", "abc"], cwd: workflowDir(), gh, script: "scripts/ci-wait.ts" })).toStrictEqual({
    lastLine: "RESULT: FAIL (browser 1/3 cut off at its time limit)",
    status: CUT_OFF_EXIT,
  });
});

it("ends merge-ticket with a fail verdict naming v1's red jobs", { timeout: 20_000 }, () => {
  expect.hasAssertions();

  const gh = { list: [RUN], log: ["e2e-docker\tpnpm e2e:docker\tboom"], view: [RED] };

  expect(lastLine({ args: ["7"], cwd: ticketRepo(), gh, script: "scripts/merge-ticket.ts" })).toBe(
    "RESULT: FAIL (v1's Check run: e2e-docker)",
  );
});

it("ends merge-ticket with ci:wait's exit code when a v1 job was cut off at its time limit", {
  timeout: 20_000,
}, () => {
  expect.hasAssertions();

  const cwd = ticketRepo();
  mkdirSync(path.join(cwd, ".github", "workflows"), { recursive: true });
  writeFileSync(path.join(cwd, ".github", "workflows", "check.yml"), LIMITED_WORKFLOW);
  const job = ended({ conclusion: "cancelled", failedStep: "pnpm check", name: "browser 1/3" });
  const cut = view({
    headSha: "abc",
    jobs: [done("static"), ranFor({ job, minutes: LIMIT_MINUTES })],
    status: COMPLETED,
  });
  const gh = { list: [RUN], view: [cut] };

  expect(ranScript({ args: ["7"], cwd, gh, script: "scripts/merge-ticket.ts" })).toStrictEqual({
    lastLine: "RESULT: FAIL (v1's Check run: browser 1/3 cut off at its time limit)",
    status: CUT_OFF_EXIT,
  });
});

it("ends merge-ticket with a fail verdict on a bad ticket number", { timeout: 20_000 }, () => {
  expect.hasAssertions();

  expect(
    lastLine({ args: ["seven"], cwd: tmpdir(), gh: { list: [], view: [] }, script: "scripts/merge-ticket.ts" }),
  ).toBe("RESULT: FAIL (usage)");
});
