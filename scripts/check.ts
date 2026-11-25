import type { Check, CiOnly } from "./lib/check-runner.ts";
import { browserSkip, browserTestsFor } from "./lib/browser-selection.ts";
import { changedLines, unchangedSince } from "./lib/changed-lines.ts";
import { fetchedCoverageMap, ghCli } from "./lib/coverage-map-fetch.ts";
import { loadReport, osReading } from "./lib/machine-load.ts";
import type { BrowserTests } from "./lib/browser-selection.ts";
import { SUITE_LOCK_FILE } from "./lib/machine-lock.ts";
import { TIMINGS_DIR } from "./lib/slowest-files.ts";
import { changedFiles } from "./lib/changed-files.ts";
import { ciGreenAtHead } from "./lib/ci-green.ts";
import { docsOnlySkip } from "./lib/docs-only.ts";
import { runChecks } from "./lib/check-runner.ts";

interface Scripted extends Omit<Check, "command"> {
  readonly script: readonly string[];
}

function option(name: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix)) ?? "";
  return found.slice(prefix.length);
}

const load = loadReport(osReading);
console.log(load.line);
if (load.warning !== "") {
  console.error(load.warning);
}

const job = option("job");
const shard = option("shard");
const base = option("base");
const inCi = process.argv.includes("--ci");

const TESTS_REPORT = `${TIMINGS_DIR}/tests.json`;
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

function withBase(script: string): readonly string[] {
  if (base !== "") {
    return [script, `--base=${base}`];
  }
  return [script];
}

const NONE = 0;
const V1 = "origin/v1";

const EXIT_SUCCESS = 0;
const ciGreen = ciGreenAtHead({ asked: !inCi && job === "", cwd: process.cwd(), gh: ghCli(process.cwd()) });
const local = !inCi && job === "" && !ciGreen.skip;
function docsOnlyRun(): ReturnType<typeof docsOnlySkip> {
  if (!local) {
    return { line: "", skip: false };
  }
  return docsOnlySkip({ base: V1, cwd: process.cwd() });
}

const docsOnly = docsOnlyRun();

function selectedBrowserTests(): BrowserTests {
  if (!local) {
    return { all: true, reason: "" };
  }
  if (docsOnly.skip) {
    return { all: false, run: [], skipped: [] };
  }
  const cwd = process.cwd();
  return browserTestsFor({
    changed: changedFiles({ base: V1, cwd }),
    coverage: () => fetchedCoverageMap({ base: V1, cwd, gh: ghCli(cwd) }),
    cwd,
    history: {
      changedLines: (file) => changedLines({ base: V1, cwd, file }),
      unchangedSince: (commit, file) => unchangedSince({ base: V1, commit, cwd, file }),
    },
  });
}

const browserTests = selectedBrowserTests();
const browserSkipped = browserSkip(browserTests);

function browserScript(): readonly string[] {
  if (inCi && shard !== "") {
    return ["browser:coverage", `--shard=${shard}`];
  }
  if (shard !== "") {
    return ["browser", `--shard=${shard}`];
  }
  if (browserTests.all) {
    return ["browser"];
  }
  return ["browser", ...browserTests.run];
}

const scripted: readonly Scripted[] = [
  { budget: 16, job: "lint", name: "lint", script: withBase("lint") },
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
    script: browserScript(),
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
  { budget: 4, job: "drift", name: "lint-config", script: withBase("lint-config") },
  { afterTests: true, budget: 6, job: "format", name: "format", script: ["format:check"] },
];

function commandOf({ script, ...check }: Scripted): Check {
  return Object.assign(check, { command: ["pnpm", "run", "--silent", ...script] });
}

const checks: readonly Check[] = scripted
  .filter((check) => check.job !== "browser" || browserTests.all || browserTests.run.length > NONE)
  .filter((check) => check.job !== "tests" || !docsOnly.skip)
  .map((check) => commandOf(check));

const ciOnly: readonly CiOnly[] = [
  {
    ciJob: "e2e-docker",
    command: "pnpm e2e:docker",
    name: "the e2e suite (packages/e2e on the Docker image)",
    workflow: "Release",
  },
  ...browserSkipped,
];

function printReasons(): void {
  for (const line of [ciGreen.line, docsOnly.line]) {
    if (line !== "") {
      console.error(line);
    }
  }
  if (browserTests.all && browserTests.reason !== "") {
    console.error(`check: running every browser test, since ${browserTests.reason}.`);
  }
}

async function exitCode(): Promise<number> {
  if (ciGreen.skip) {
    console.log(ciGreen.line);
    return EXIT_SUCCESS;
  }
  printReasons();
  const code = await runChecks({ checks, ciOnly, inCi, job, lockFile: SUITE_LOCK_FILE });
  return code;
}

process.exitCode = await exitCode();
