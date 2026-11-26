import { expect, it, onTestFinished, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import type { Check } from "../lib/check-runner.ts";
import path from "node:path";
import { runChecks } from "../lib/check-runner.ts";
import { tmpdir } from "node:os";

const SLOW = { budget: 0, command: ["node", "-e", "setTimeout(() => {}, 20)"], job: "a", name: "slow" } as const;
const BROKEN = { budget: 60, command: ["node", "-e", "process.exit(1)"], job: "a", name: "broken" } as const;
const ALSO_BROKEN = { ...BROKEN, name: "also-broken" } as const;
const LAST = -1;

const E2E = { ciJob: "e2e-docker", command: "pnpm e2e:docker", name: "the e2e suite", workflow: "Release" } as const;
const BROWSER = { ciJob: "browser", command: "pnpm browser", name: "the other browser tests" } as const;
const HOOK = {
  ciJob: "static",
  command: "pnpm check --all",
  hook: true,
  name: "lint, format, types and seams",
} as const;
const PASSING = { ...BROKEN, command: ["node", "-e", ""], name: "passing" } as const;
const SKIP_LINES = [
  "skipped: the e2e suite, which CI runs as the Release workflow's e2e-docker job. Run it here on purpose with pnpm e2e:docker.",
  "skipped: lint, format, types and seams, the pre-commit hook's, which it ran on every commit and CI runs as its static job. Run them here on purpose with pnpm check --all.",
  "skipped: the other browser tests, which CI runs as its browser job. Run it here on purpose with pnpm browser.",
];

interface Run {
  readonly inCi?: boolean;
  readonly job?: string;
}

async function printed(checks: readonly Check[], { inCi = false, job = "" }: Run = {}): Promise<readonly string[]> {
  const dir = mkdtempSync(path.join(tmpdir(), "check-verdict-"));
  onTestFinished(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  const lines: string[] = [];
  function capture(...parts: readonly unknown[]): void {
    lines.push(...parts.map(String).join(" ").split("\n"));
  }
  const log = vi.spyOn(console, "log").mockImplementation(capture);
  const error = vi.spyOn(console, "error").mockImplementation(capture);
  onTestFinished(() => {
    log.mockRestore();
    error.mockRestore();
  });
  await runChecks({ checks, ciOnly: [E2E, HOOK, BROWSER], inCi, job, lockFile: path.join(dir, "check.lock") });
  return lines;
}

it("ends with a pass verdict after a time budget warning", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const lines = await printed([SLOW]);

  expect([lines.some((line) => line.startsWith("warning: slow took")), lines.at(LAST)]).toStrictEqual([
    true,
    "RESULT: PASS",
  ]);
});

it("ends with a fail verdict naming every failed check", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const lines = await printed([BROKEN, SLOW, ALSO_BROKEN]);

  expect(lines.at(LAST)).toBe("RESULT: FAIL (broken, also-broken)");
});

it("names the CI-only suite it skipped, and how to run it, before its verdict", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const lines = await printed([PASSING]);

  expect(lines.filter((line) => line.startsWith("skipped:"))).toStrictEqual(SKIP_LINES);
});

it("skips nothing in CI, which runs the e2e suite as its own job", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const lines = await printed([PASSING], { inCi: true });

  expect(lines.some((line) => line.startsWith("skipped:"))).toBe(false);
});

it("names no skip on a run of one job", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const lines = await printed([PASSING], { job: "a" });

  expect(lines.some((line) => line.startsWith("skipped:"))).toBe(false);
});
