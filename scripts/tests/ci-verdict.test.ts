import { COMPLETED, RUN, done, ended, ghOnPath, view } from "./lib/fake-gh.ts";
import { execFileSync, spawnSync } from "node:child_process";
import { expect, it, onTestFinished } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

function lastLine({ args, cwd, gh, script }: Script): string {
  const bin = ghOnPath(gh);
  const merged = `PATH="$0:$PATH" node --import "$0/no-sleep.mjs" "$@" 2>&1`;
  const ran = spawnSync("sh", ["-c", merged, bin, path.resolve(script), ...args], { cwd, encoding: "utf8" });
  return ran.stdout.trimEnd().split("\n").at(LAST) ?? "";
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

it("ends merge-ticket with a fail verdict naming the red ticket's jobs", { timeout: 20_000 }, () => {
  expect.hasAssertions();

  const gh = { list: [RUN], log: [BUDGET_LOG, "e2e-docker\tpnpm e2e:docker\tboom"], view: [BUDGET_WARNED, RED] };

  expect(lastLine({ args: ["7"], cwd: ticketRepo(), gh, script: "scripts/merge-ticket.ts" })).toBe(
    "RESULT: FAIL (ticket-7's Check run: e2e-docker)",
  );
});

it("ends merge-ticket with a fail verdict on a bad ticket number", { timeout: 20_000 }, () => {
  expect.hasAssertions();

  expect(
    lastLine({ args: ["seven"], cwd: tmpdir(), gh: { list: [], view: [] }, script: "scripts/merge-ticket.ts" }),
  ).toBe("RESULT: FAIL (usage)");
});
