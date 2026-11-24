import type { Check } from "./lib/check-runner.ts";
import { SUITE_LOCK_FILE } from "./lib/machine-lock.ts";
import { TIMINGS_DIR } from "./lib/slowest-files.ts";
import path from "node:path";
import { runChecks } from "./lib/check-runner.ts";

interface Scripted extends Omit<Check, "command"> {
  readonly script: readonly string[];
}

function option(name: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix)) ?? "";
  return found.slice(prefix.length);
}

const job = option("job");
const shard = option("shard");
const base = option("base");
const inCi = process.argv.includes("--ci");

const TESTS_REPORT = path.join(TIMINGS_DIR, "tests.json");
const JSON_REPORTER = ["--reporter=json", `--outputFile.json=${TESTS_REPORT}`];
const WITH_DEFAULT_REPORTER = ["--reporter=default", ...JSON_REPORTER];

function testScript(): readonly string[] {
  if (shard !== "") {
    return ["test:shard", `--shard=${shard}`, ...JSON_REPORTER];
  }
  if (process.argv.includes("--merge")) {
    return ["test:merge", ...WITH_DEFAULT_REPORTER];
  }
  return ["test", ...WITH_DEFAULT_REPORTER];
}

function lintScript(): readonly string[] {
  if (base !== "") {
    return ["lint", `--base=${base}`];
  }
  return ["lint"];
}

const scripted: readonly Scripted[] = [
  { budget: 16, job: "lint", name: "lint", script: lintScript() },
  { budget: 18, job: "canaries", name: "canaries", script: ["canaries"] },
  { budget: 10, job: "types", name: "types", script: ["typecheck"] },
  { budget: 16, job: "fixers", name: "fixers", script: ["fixers"] },
  { budget: 8, job: "seams", name: "seams", script: ["seams"] },
  {
    budget: 26,
    job: "tests",
    name: "tests",
    script: testScript(),
    timings: { base: process.cwd(), file: TESTS_REPORT, runner: "vitest" },
  },
  {
    budget: 30,
    job: "browser",
    name: "browser",
    script: ["browser"],
    timings: {
      base: "app/modules/routes/tests/browser",
      file: path.join(TIMINGS_DIR, "browser.json"),
      runner: "playwright",
    },
  },
  { budget: 10, job: "knip", name: "knip", script: ["knip"] },
  { budget: 10, job: "drift", name: "validators", script: ["validators:check"] },
  { budget: 6, job: "drift", name: "hygiene", script: ["hygiene"] },
  { budget: 6, job: "drift", name: "docs", script: ["docs"] },
  { budget: 10, job: "drift", name: "api", script: ["api"] },
  { budget: 6, job: "drift", name: "exports", script: ["exports"] },
  { afterTests: true, budget: 6, job: "format", name: "format", script: ["format:check"] },
];

function commandOf({ script, ...check }: Scripted): Check {
  return Object.assign(check, { command: ["pnpm", "run", "--silent", ...script] });
}

const checks: readonly Check[] = scripted.map((check) => commandOf(check));

process.exitCode = await runChecks({ checks, inCi, job, lockFile: SUITE_LOCK_FILE });
