import { browserTestsSince, reachedShard } from "./lib/reached-browser.ts";
import { checkPlan, reasonLines } from "./lib/check-plan.ts";
import { ciUnitShard, unitTestsFor } from "./lib/test-selection.ts";
import { loadReport, osReading } from "./lib/machine-load.ts";
import type { BrowserTests } from "./lib/browser-selection.ts";
import type { ReachedPlan } from "./lib/reached-browser.ts";
import { SUITE_LOCK_FILE } from "./lib/machine-lock.ts";
import type { UnitTests } from "./lib/test-selection.ts";
import { changedFiles } from "./lib/changed-files.ts";
import { ciBrowserShard } from "./lib/browser-selection.ts";
import { ciGreenAtHead } from "./lib/ci-green.ts";
import { ghCli } from "./lib/coverage-map-fetch.ts";
import { runChecks } from "./lib/check-runner.ts";

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
const all = process.argv.includes("--all");
const reached = inCi && job === "browser" && process.argv.includes("--reached");

const V1 = "origin/v1";
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const EVERYTHING: UnitTests & BrowserTests = { all: true, reason: "" };
const NOT_REACHED: ReachedPlan = { args: [], failure: "", lines: [], nothing: "" };

const ciGreen = ciGreenAtHead({ asked: !inCi && job === "" && !all, cwd: process.cwd(), gh: ghCli(process.cwd()) });
const local = !inCi && job === "" && !all && !ciGreen.skip;
const changed = changedFiles({ base: V1, cwd: process.cwd() });

function selectedUnitTests(): UnitTests {
  if (!local) {
    return EVERYTHING;
  }
  return unitTestsFor(changed);
}

function selectedBrowserTests(): BrowserTests {
  if (!local && !reached) {
    return EVERYTHING;
  }
  return browserTestsSince({ base: V1, changed, cwd: process.cwd() });
}

const unitTests = selectedUnitTests();
const browserTests = selectedBrowserTests();

function ciShard(): typeof ciBrowserShard | null {
  if (!inCi || shard === "") {
    return null;
  }
  if (job === "browser") {
    return ciBrowserShard;
  }
  if (job === "tests") {
    return ciUnitShard;
  }
  return null;
}

function reachedPlan(): ReachedPlan {
  if (!reached) {
    return NOT_REACHED;
  }
  const cwd = process.cwd();
  return reachedShard({ cwd, gh: ghCli(cwd), run: option("run"), shard, tests: browserTests });
}

const reachedShardPlan = reachedPlan();

function plannedShard(): Pick<ReachedPlan, "args" | "failure"> {
  if (reached) {
    return reachedShardPlan;
  }
  const planned = ciShard();
  if (planned === null) {
    return { args: [`--shard=${shard}`], failure: "" };
  }
  const shardPlan = planned({ cwd: process.cwd(), gh: ghCli(process.cwd()), run: option("run"), shard });
  if (shardPlan.line !== "") {
    console.log(shardPlan.line);
  }
  return shardPlan;
}

const shardRun = plannedShard();

const plan = checkPlan({
  base,
  browser: browserTests,
  inCi,
  local,
  merge: process.argv.includes("--merge"),
  reached,
  shard,
  shardArgs: shardRun.args,
  unit: unitTests,
});

function printReasons(): void {
  const reasons = reasonLines({ browser: browserTests, unit: unitTests });
  for (const line of [ciGreen.line, ...reachedShardPlan.lines, ...reasons]) {
    if (line !== "") {
      console.error(line);
    }
  }
}

function earlyVerdict(): string {
  if (ciGreen.skip) {
    return ciGreen.line;
  }
  printReasons();
  if (reachedShardPlan.nothing !== "") {
    return `${reachedShardPlan.nothing}\nRESULT: PASS`;
  }
  return "";
}

async function exitCode(): Promise<number> {
  if (shardRun.failure !== "") {
    console.error(`check: ${shardRun.failure}`);
    console.log(`RESULT: FAIL (${job} shard ${shard})`);
    return EXIT_FAILURE;
  }
  const early = earlyVerdict();
  if (early !== "") {
    console.log(early);
    return EXIT_SUCCESS;
  }
  const code = await runChecks({
    checks: plan.checks,
    ciOnly: plan.skipped,
    inCi,
    job,
    lockFile: SUITE_LOCK_FILE,
    recordTime: local,
  });
  return code;
}

process.exitCode = await exitCode();
