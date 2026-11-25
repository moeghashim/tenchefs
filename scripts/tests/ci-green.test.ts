import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { expect, it, onTestFinished } from "vitest";
import type { Outcome } from "../lib/tools.ts";
import { ciGreenAtHead } from "../lib/ci-green.ts";
import path from "node:path";
import { tmpdir } from "node:os";

type Gh = (args: readonly string[]) => Outcome<string>;

const URL = "https://github.com/o/r/actions/runs/7";
const SETUP = [
  ["init", "-q", "-b", "ticket-7"],
  ["config", "user.email", "test@example.com"],
  ["config", "user.name", "Test"],
  ["add", "."],
  ["commit", "-q", "-m", "first"],
] as const;
const LAST = -1;
const PASSED = 0;
const CHECK = path.resolve("scripts/check.ts");
const EXECUTABLE = 0o755;
const WITH_BIN = 'PATH="$0:$PATH" exec node "$1"';
const GREEN_LISTING = JSON.stringify([{ conclusion: "success", url: URL }]);
const RUN_EVERYTHING = { line: "", skip: false } as const;

function failing(): Outcome<string> {
  return { ok: false, reason: "gh run list failed: not logged in\nmore detail" };
}

function garbled(): Outcome<string> {
  return { ok: true, value: "not json" };
}

function unaskable(): Outcome<string> {
  throw new Error("gh was asked");
}

function git(cwd: string, ...args: readonly string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function temporary(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  onTestFinished(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  return dir;
}

function cleanRepo(): string {
  const dir = temporary("ci-green-");
  writeFileSync(path.join(dir, "app.ts"), "export {};\n");
  for (const args of SETUP) {
    git(dir, ...args);
  }
  return dir;
}

function fakeGhBin(): string {
  const bin = temporary("ci-green-bin-");
  const gh = path.join(bin, "gh");
  writeFileSync(gh, `#!/bin/sh\necho '${GREEN_LISTING}'\n`);
  chmodSync(gh, EXECUTABLE);
  return bin;
}

function listing(...runs: readonly { readonly conclusion: string; readonly url: string }[]): Gh {
  return () => ({ ok: true, value: JSON.stringify(runs) });
}

it("passes a clean tree whose HEAD has a green push Check run", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = cleanRepo();
  const asked: (readonly string[])[] = [];
  function gh(args: readonly string[]): Outcome<string> {
    asked.push(args);
    return listing({ conclusion: "failure", url: "red" }, { conclusion: "success", url: URL })(args);
  }
  const head = git(dir, "rev-parse", "HEAD");

  expect(ciGreenAtHead({ asked: true, cwd: dir, gh })).toStrictEqual({
    line: `RESULT: PASS (CI green at HEAD ${URL})`,
    skip: true,
  });
  expect(asked).toStrictEqual([
    ["run", "list", "--workflow", "Check", "--event", "push", "--commit", head, "--json", "conclusion,url"],
  ]);
});

it("runs everything when HEAD has no green run", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = cleanRepo();
  const runs = [listing(), listing({ conclusion: "failure", url: URL }), listing({ conclusion: "", url: URL })];

  expect(runs.map((gh) => ciGreenAtHead({ asked: true, cwd: dir, gh }))).toStrictEqual([
    RUN_EVERYTHING,
    RUN_EVERYTHING,
    RUN_EVERYTHING,
  ]);
});

it("runs everything, without asking gh, on an uncommitted change or a --ci or --job run", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const edited = cleanRepo();
  writeFileSync(path.join(edited, "app.ts"), "export const a = 1;\n");
  const untracked = cleanRepo();
  writeFileSync(path.join(untracked, "new.ts"), "export {};\n");

  expect([
    ciGreenAtHead({ asked: true, cwd: edited, gh: unaskable }),
    ciGreenAtHead({ asked: true, cwd: untracked, gh: unaskable }),
    ciGreenAtHead({ asked: false, cwd: cleanRepo(), gh: unaskable }),
  ]).toStrictEqual([RUN_EVERYTHING, RUN_EVERYTHING, RUN_EVERYTHING]);
});

it("runs everything and says why in one line when gh fails", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = cleanRepo();

  expect([
    ciGreenAtHead({ asked: true, cwd: dir, gh: failing }),
    ciGreenAtHead({ asked: true, cwd: dir, gh: garbled }),
  ]).toStrictEqual([
    {
      line: "check: running everything, since gh could not say whether CI passed HEAD (gh run list failed: not logged in).",
      skip: false,
    },
    {
      line: "check: running everything, since gh could not say whether CI passed HEAD (gh printed no list of runs).",
      skip: false,
    },
  ]);
});

it("pnpm check exits 0 without running jobs when CI is green at HEAD", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const dir = cleanRepo();
  const ran = spawnSync("sh", ["-c", WITH_BIN, fakeGhBin(), CHECK], { cwd: dir, encoding: "utf8" });

  expect(ran.status).toBe(PASSED);
  expect(ran.stdout.trimEnd().split("\n").at(LAST)).toBe(`RESULT: PASS (CI green at HEAD ${URL})`);
  expect(ran.stdout).not.toContain("skipped:");
});
