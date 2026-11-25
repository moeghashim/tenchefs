import { COMPLETED, RUN, done, ghOnPath, view } from "./lib/fake-gh.ts";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { expect, it, onTestFinished } from "vitest";
import path from "node:path";
import { tmpdir } from "node:os";

const LAST = -1;
const EXECUTABLE = 0o755;
const PR = "https://github.com/o/r/pull/9";
const GREEN = view({ jobs: [done("lint"), done("tests")], status: COMPLETED });
const EXIT_OK = 0;
const START = 0;
const SHORT = 12;
const FAST_FORWARDED = /^merge-ticket: Fast-forwarded v1 to [0-9a-f]{40}, whose Check run is green\.$/u;
const IDENTITY = [
  ["user.email", "test@example.com"],
  ["user.name", "Test"],
  ["commit.gpgsign", "false"],
] as const;

function git(cwd: string, ...args: readonly string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function initRepos(): { readonly origin: string; readonly work: string } {
  const root = mkdtempSync(path.join(tmpdir(), "merge-fixes-red-v1-"));
  onTestFinished(() => {
    rmSync(root, { force: true, recursive: true });
  });
  const origin = path.join(root, "origin.git");
  const work = path.join(root, "work");
  git(root, "init", "-q", "--bare", "-b", "v1", origin);
  git(root, "init", "-q", "-b", "v1", work);
  for (const [key, value] of IDENTITY) {
    git(work, "config", key, value);
  }
  git(work, "remote", "add", "origin", origin);
  return { origin, work };
}

function commitFile(work: string, file: string, message: string): void {
  writeFileSync(path.join(work, file), `${file}\n`);
  git(work, "add", file);
  git(work, "commit", "-q", "-m", message);
}

function ticketRepo(): { readonly origin: string; readonly work: string } {
  const repos = initRepos();
  commitFile(repos.work, "a.txt", "first");
  git(repos.work, "push", "-q", "origin", "v1");
  git(repos.work, "checkout", "-q", "-b", "ticket-7");
  commitFile(repos.work, "b.txt", "the ticket");
  git(repos.work, "fetch", "-q", "origin");
  return repos;
}

function stubbedBin(): string {
  const bin = ghOnPath({
    "issue view": ["Add the c table"],
    list: [RUN],
    "pr list": [[{ number: 9, url: PR }]],
    view: [GREEN],
  });
  writeFileSync(path.join(bin, "pnpm"), "#!/bin/sh\nexit 0\n");
  chmodSync(path.join(bin, "pnpm"), EXECUTABLE);
  return bin;
}

function mergeTicket(bin: string, work: string): { readonly lines: readonly string[]; readonly status: number | null } {
  const script = `PATH="$0:$PATH" node --import "$0/no-sleep.mjs" "$@" 2>&1`;
  const ran = spawnSync("sh", ["-c", script, bin, path.resolve("scripts/merge-ticket.ts"), "7", "--fixes-red-v1"], {
    cwd: work,
    encoding: "utf8",
  });
  return { lines: ran.stdout.trimEnd().split("\n"), status: ran.status };
}

it("lands a --fixes-red-v1 merge by fast-forwarding v1 to merge-ticket-N's green commit, printing v1's new SHA", {
  timeout: 20_000,
}, () => {
  expect.hasAssertions();

  const bin = stubbedBin();
  const { origin, work } = ticketRepo();

  const { lines, status } = mergeTicket(bin, work);

  const calls = readFileSync(path.join(bin, "calls.log"), "utf8").trim().split("\n");
  const v1 = git(origin, "rev-parse", "v1");

  expect([status, lines.at(LAST), git(origin, "rev-parse", "v1^2")]).toStrictEqual([
    EXIT_OK,
    `RESULT: MERGED ${v1}`,
    git(work, "rev-parse", "ticket-7"),
  ]);
  expect(lines).toStrictEqual(
    expect.arrayContaining([
      `merge-ticket: Reusing merge-ticket-7-${v1.slice(START, SHORT)}'s pull request into v1: ${PR}`,
      expect.stringMatching(FAST_FORWARDED),
      `merge-ticket: merged ticket-7 into v1 at ${v1}, whose merge-ticket-7 Check run is green.`,
    ]),
  );
  expect([
    calls.filter((call) => call.includes("--branch v1")),
    calls.filter((call) => /^pr merge|isInMergeQueue/u.test(call)),
  ]).toStrictEqual([[], []]);
});
