import { COMPLETED, RUN, done, ended, ghOnPath, view } from "./lib/fake-gh.ts";
import { execFileSync, spawnSync } from "node:child_process";
import { expect, it, onTestFinished } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const GREEN = view({ jobs: [done("lint"), done("e2e-docker")], status: COMPLETED });
const RED = view({
  jobs: [done("lint"), ended({ conclusion: "failure", failedStep: "pnpm e2e:docker", name: "e2e-docker" })],
  status: COMPLETED,
});
const RERUN_LINE =
  "merge-ticket: ticket-7's Check run 42 is red: rerunning its failed jobs once, in case they were flaky: e2e-docker.";

interface Ran {
  readonly calls: readonly string[];
  readonly lines: readonly string[];
}

function git(cwd: string, ...args: readonly string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function ticketRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rerun-"));
  onTestFinished(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  writeFileSync(path.join(dir, "a.txt"), "a\n");
  for (const args of SETUP) {
    git(dir, ...args);
  }
  return dir;
}

function mergeTicket(gh: Responses): Ran {
  const bin = ghOnPath(gh);
  const script = `PATH="$0:$PATH" node --import "$0/no-sleep.mjs" "$@" 2>&1`;
  const ran = spawnSync("sh", ["-c", script, bin, path.resolve("scripts/merge-ticket.ts"), "7"], {
    cwd: ticketRepo(),
    encoding: "utf8",
  });
  const calls = readFileSync(path.join(bin, "calls.log"), "utf8").trim().split("\n");
  return { calls: calls.filter((call) => call.startsWith("run rerun")), lines: ran.stdout.trimEnd().split("\n") };
}

it("reruns a red ticket run's failed jobs once on a fresh run, and goes on to merge when the rerun is green", {
  timeout: 20_000,
}, () => {
  expect.hasAssertions();

  const { calls, lines } = mergeTicket({ list: [RUN], log: ["boom"], rerun: [""], view: [GREEN, RED, GREEN, GREEN] });

  expect(calls).toStrictEqual(["run rerun 42 --failed"]);
  expect(lines).toStrictEqual(
    expect.arrayContaining([
      RERUN_LINE,
      "merge-ticket: ticket-7's latest Check run is green: https://github.com/o/r/actions/runs/42",
      "merge-ticket: Attempt 1 of 5: merging ticket-7 into origin/v1",
    ]),
  );
});

it("fails a fresh run naming the jobs when the ticket run is red again after its rerun", { timeout: 20_000 }, () => {
  expect.hasAssertions();

  const { calls, lines } = mergeTicket({
    list: [RUN],
    log: ["boom"],
    rerun: [""],
    view: [GREEN, RED, GREEN, RED, GREEN],
  });

  expect(calls).toStrictEqual(["run rerun 42 --failed"]);
  expect(lines).toStrictEqual(
    expect.arrayContaining([RERUN_LINE, "Its failed jobs were rerun once and failed again."]),
  );
  expect(lines.at(LAST)).toBe("RESULT: FAIL (ticket-7's Check run: e2e-docker)");
});
