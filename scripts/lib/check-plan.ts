import type { Check, CiOnly } from "./check-runner.ts";
import type { BrowserTests } from "./browser-selection.ts";
import { TIMINGS_DIR } from "./slowest-files.ts";
import type { UnitTests } from "./test-selection.ts";
import { browserSkip } from "./browser-selection.ts";
import { unitSkip } from "./test-selection.ts";

interface Scripted extends Omit<Check, "command"> {
  readonly script: readonly string[];
}

interface Planning {
  readonly base: string;
  readonly browser: BrowserTests;
  readonly inCi: boolean;
  readonly local: boolean;
  readonly merge: boolean;
  readonly reached: boolean;
  readonly shard: string;
  readonly shardArgs: readonly string[];
  readonly unit: UnitTests;
}

interface Selected {
  readonly browser: BrowserTests;
  readonly unit: UnitTests;
}

interface Reasoned {
  readonly line: string;
  readonly reason: string;
}

interface Plan {
  readonly checks: readonly Check[];
  readonly skipped: readonly CiOnly[];
}

const NONE = 0;
const TESTS_REPORT = `${TIMINGS_DIR}/tests.json`;
const JSON_REPORTER = ["--reporter=json", `--outputFile.json=${TESTS_REPORT}`];
const WITH_DEFAULT_REPORTER = ["--reporter=default", ...JSON_REPORTER];
const HOOK_RAN = new Set(["format", "lint", "seams", "types"]);

const E2E: CiOnly = {
  ciJob: "e2e-docker",
  command: "pnpm e2e:docker",
  name: "the e2e suite (packages/e2e on the Docker image)",
  workflow: "Check",
};

const HOOK: CiOnly = {
  ciJob: "static",
  command: "pnpm check --all",
  hook: true,
  name: "lint, format, types and seams",
};

function testScript({ merge, shard, shardArgs, unit }: Planning): readonly string[] {
  if (shard !== "") {
    return ["test:shard", ...shardArgs, ...JSON_REPORTER];
  }
  if (merge) {
    return ["test:merge", ...WITH_DEFAULT_REPORTER];
  }
  if (!unit.all) {
    return ["test:related", ...WITH_DEFAULT_REPORTER, ...unit.related];
  }
  return ["test", ...WITH_DEFAULT_REPORTER];
}

function withBase(script: string, { base }: Planning): readonly string[] {
  if (base !== "") {
    return [script, `--base=${base}`];
  }
  return [script];
}

function ciBrowserScript({ reached }: Planning): string {
  if (reached) {
    return "browser";
  }
  return "browser:coverage";
}

function browserScript(planning: Planning): readonly string[] {
  const { browser, inCi, shard, shardArgs } = planning;
  if (inCi && shard !== "") {
    return [ciBrowserScript(planning), ...shardArgs];
  }
  if (shard !== "") {
    return ["browser", ...shardArgs];
  }
  if (browser.all) {
    return ["browser"];
  }
  return ["browser", ...browser.run];
}

function scriptedChecks(planning: Planning): readonly Scripted[] {
  return [
    { budget: 16, job: "lint", name: "lint", script: withBase("lint", planning) },
    { budget: 18, job: "canaries", name: "canaries", script: ["canaries"] },
    { budget: 10, job: "types", name: "types", script: ["typecheck"] },
    { budget: 16, job: "fixers", name: "fixers", script: ["fixers"] },
    { budget: 8, job: "seams", name: "seams", script: ["seams"] },
    {
      budget: 90,
      job: "tests",
      name: "tests",
      script: testScript(planning),
      timings: { base: process.cwd(), file: TESTS_REPORT, runner: "vitest" },
    },
    {
      budget: 30,
      job: "browser",
      name: "browser",
      script: browserScript(planning),
      timings: {
        base: "app/modules/routes/tests/browser",
        file: `${TIMINGS_DIR}/browser.json`,
        runner: "playwright",
      },
    },
    { budget: 10, job: "knip", name: "knip", script: ["knip"] },
    { budget: 10, job: "drift", name: "validators", script: ["validators:check"] },
    { budget: 6, job: "drift", name: "hygiene", script: ["hygiene"] },
    { budget: 6, job: "drift", name: "docs", script: ["docs"] },
    { budget: 10, job: "drift", name: "api", script: ["api"] },
    { budget: 6, job: "drift", name: "exports", script: ["exports"] },
    { budget: 4, job: "drift", name: "render", script: ["render"] },
    { budget: 4, job: "drift", name: "lint-config", script: withBase("lint-config", planning) },
    { afterTests: true, budget: 6, job: "format", name: "format", script: ["format:check"] },
  ];
}

function commandOf({ script, ...check }: Scripted): Check {
  return Object.assign(check, { command: ["pnpm", "run", "--silent", ...script] });
}

function runsBrowser(browser: BrowserTests): boolean {
  return browser.all || browser.run.length > NONE;
}

function runsUnit(unit: UnitTests): boolean {
  return unit.all || unit.related.length > NONE;
}

function selected(check: Scripted, { browser, local, unit }: Planning): boolean {
  if (local && HOOK_RAN.has(check.job)) {
    return false;
  }
  if (check.job === "browser") {
    return runsBrowser(browser);
  }
  if (check.job === "tests") {
    return runsUnit(unit);
  }
  return true;
}

function checkPlan(planning: Planning): Plan {
  const checks = scriptedChecks(planning)
    .filter((check) => selected(check, planning))
    .map((check) => commandOf(check));
  const hook = [HOOK].filter(() => planning.local);
  return { checks, skipped: [E2E, ...hook, ...unitSkip(planning.unit), ...browserSkip(planning.browser)] };
}

function reasonOf(tests: UnitTests | BrowserTests): string {
  if (tests.all) {
    return tests.reason;
  }
  return "";
}

function reasonLines({ browser, unit }: Selected): readonly string[] {
  const unitReason = reasonOf(unit);
  const browserReason = reasonOf(browser);
  if (unitReason !== "" && unitReason === browserReason) {
    return [`check: running every unit and browser test, since ${unitReason}.`];
  }
  const lines: readonly Reasoned[] = [
    { line: `check: running every unit test, since ${unitReason}.`, reason: unitReason },
    { line: `check: running every browser test, since ${browserReason}.`, reason: browserReason },
  ];
  return lines.filter(({ reason }) => reason !== "").map(({ line }) => line);
}

export { checkPlan, reasonLines };
