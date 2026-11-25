import { COMPLETED, RUN, done, ghOnPath, view } from "./lib/fake-gh.ts";
import { execFileSync, spawnSync } from "node:child_process";
import { expect, it, onTestFinished } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { Responses } from "./lib/fake-gh.ts";
import path from "node:path";
import { tmpdir } from "node:os";

const SETUP = [
  ["init", "-q", "-b", "v1"],
  ["config", "user.email", "test@example.com"],
  ["config", "user.name", "Test"],
  ["add", "a.txt"],
  ["commit", "-q", "-m", "first"],
  ["branch", "ticket-7"],
  ["update-ref", "refs/remotes/origin/v1", "HEAD"],
] as const;
const GREEN = view({ jobs: [done("static"), done("browser 1/3")], status: COMPLETED });

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
  return { calls, lines: ran.stdout.trimEnd().split("\n") };
}

it("judges v1's Check run and no ticket-N run before it merges", { timeout: 20_000 }, () => {
  expect.hasAssertions();

  const { calls, lines } = mergeTicket({ list: [RUN], view: [GREEN] });

  expect([
    calls.filter((call) => call.includes("ticket-7")),
    lines.filter((line) => line.includes("ticket-7's")),
    lines,
  ]).toStrictEqual([
    [],
    [],
    expect.arrayContaining([
      "merge-ticket: v1's latest Check run is green: https://github.com/o/r/actions/runs/42",
      "merge-ticket: Merging ticket-7 into origin/v1",
    ]),
  ]);
});
