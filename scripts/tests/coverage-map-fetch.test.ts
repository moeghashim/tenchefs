import { expect, it, onTestFinished } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { CoverageMap } from "../lib/browser-coverage.ts";
import type { Outcome } from "../lib/tools.ts";
import { execFileSync } from "node:child_process";
import { fetchedCoverageMap } from "../lib/coverage-map-fetch.ts";
import path from "node:path";
import { tmpdir } from "node:os";

const NOT_ON_BASE = "0123456789abcdef0123456789abcdef01234567";
const RUN_ID = 2;
const LAST = -1;
const SETUP = [
  ["init", "-q", "-b", "v1"],
  ["config", "user.email", "test@example.com"],
  ["config", "user.name", "Test"],
  ["commit", "-q", "--allow-empty", "-m", "first"],
  ["commit", "-q", "--allow-empty", "-m", "second"],
] as const;

interface Artifact {
  readonly expired?: boolean;
  readonly recorded?: string;
  readonly sha: string;
}

interface Fake {
  readonly calls: string[];
  readonly gh: (args: readonly string[]) => Outcome<string>;
}

function git(cwd: string, ...args: readonly string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function repo(): { readonly dir: string; readonly first: string; readonly second: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "coverage-map-fetch-"));
  onTestFinished(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  for (const args of SETUP) {
    git(dir, ...args);
  }
  const second = git(dir, "rev-parse", "v1");
  const first = git(dir, "rev-parse", "v1^");
  git(dir, "checkout", "-q", "-b", "ticket-7", first);
  git(dir, "commit", "-q", "--allow-empty", "-m", "ticket");
  return { dir, first, second };
}

function verbOf(call: string): string {
  const [verb = ""] = call.split(" ");
  return verb;
}

function offline(): Outcome<string> {
  return { ok: false, reason: "gh api failed: offline" };
}

function mapAt(commit: string): CoverageMap {
  return { commit, files: {}, tests: {} };
}

function fakeGh(artifacts: readonly Artifact[]): Fake {
  const calls: string[] = [];
  const listing = {
    artifacts: artifacts.map(({ expired = false, sha }, index) => ({
      expired,
      id: index,
      workflow_run: { head_sha: sha, id: index },
    })),
  };
  function gh(args: readonly string[]): Outcome<string> {
    calls.push(args.join(" "));
    if (verbOf(args.join(" ")) === "api") {
      return { ok: true, value: JSON.stringify(listing) };
    }
    const { recorded, sha } = artifacts[Number(args[RUN_ID])] ?? { sha: "" };
    const shard = path.join(args.at(LAST) ?? "", "browser-coverage-map-1");
    mkdirSync(shard);
    writeFileSync(
      path.join(shard, "map.json"),
      JSON.stringify({ ...mapAt(recorded ?? sha), incomplete: [], shard: "1/1" }),
    );
    return { ok: true, value: "" };
  }
  return { calls, gh };
}

it("fetches CI's newest coverage map from a commit on the branch's base, and keeps it for the next check", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { dir, first, second } = repo();
  const fake = fakeGh([{ sha: second }, { sha: NOT_ON_BASE }, { expired: true, sha: first }, { sha: first }]);

  const fetched = [
    fetchedCoverageMap({ base: "v1", cwd: dir, gh: fake.gh }),
    fetchedCoverageMap({ base: "v1", cwd: dir, gh: fake.gh }),
  ];

  expect({ calls: fake.calls.map((call) => verbOf(call)), fetched }).toStrictEqual({
    calls: ["api", "run"],
    fetched: [
      { ok: true, value: mapAt(first) },
      { ok: true, value: mapAt(first) },
    ],
  });
});

it("takes the map's commit from the map, since a Release run records an older v1 commit than its own", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { dir, first } = repo();
  const older = "fedcba9876543210fedcba9876543210fedcba98";

  expect(fetchedCoverageMap({ base: "v1", cwd: dir, gh: fakeGh([{ recorded: older, sha: first }]).gh })).toStrictEqual({
    ok: true,
    value: mapAt(older),
  });
});

it("finds no coverage map when CI recorded none on the branch's base", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { dir, second } = repo();

  expect(fetchedCoverageMap({ base: "v1", cwd: dir, gh: fakeGh([{ sha: second }]).gh })).toStrictEqual({
    ok: false,
    reason: "CI has recorded none for a commit on this branch's base",
  });
});

it("finds no coverage map when gh can't reach CI", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { dir } = repo();

  expect(fetchedCoverageMap({ base: "v1", cwd: dir, gh: offline })).toStrictEqual({
    ok: false,
    reason: "gh api failed: offline",
  });
});
