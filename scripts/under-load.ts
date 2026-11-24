import { SUITE_LOCK_FILE, holdMachineLock, waitingLine } from "./lib/machine-lock.ts";
import { availableParallelism, tmpdir } from "node:os";
import {
  failingOnlyUnderLoad,
  failureList,
  filesOf,
  playwrightCount,
  playwrightFailures,
  vitestCount,
  vitestFailures,
} from "./lib/under-load.ts";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { FailedTest } from "./lib/under-load.ts";
import { once } from "node:events";
import { parseArgs } from "node:util";
import { parseJson } from "./lib/json.ts";
import path from "node:path";
import { spawn } from "node:child_process";

const SCRIPT = "under-load";
const LOCK_POLL_MS = 1000;
const MS_PER_MINUTE = 60_000;
const SPARE_CORES = 1;
const NONE = 0;
const BROWSER_DIR = "app/modules/routes/tests/browser";
const BROWSER_REPORT = ".timings/browser.json";
const BUSY_LOOP = "const end = Date.now() + Number(process.argv[1]); while (Date.now() < end) {}";

const { values } = parseArgs({
  options: {
    minutes: { default: "10", type: "string" },
    workers: { default: String(availableParallelism() - SPARE_CORES), type: "string" },
  },
});
const workerCount = Number(values.workers);
const runLimitMs = Number(values.minutes) * MS_PER_MINUTE;

interface Ran {
  readonly stopped: boolean;
}

async function run(command: string, args: readonly string[]): Promise<Ran> {
  const child = spawn(command, args, { stdio: ["ignore", "ignore", "inherit"], timeout: runLimitMs });
  const closed: readonly unknown[] = await once(child, "close");
  return { stopped: closed.includes("SIGTERM") };
}

function readReport(file: string): unknown {
  try {
    return parseJson(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

interface Outcome {
  readonly failures: readonly FailedTest[];
  readonly stopped: boolean;
  readonly tests: number;
}

interface Suite {
  readonly directory: string;
  readonly files: readonly string[];
}

async function webOutcome({ directory, files }: Suite): Promise<Outcome> {
  const output = path.join(directory, "web.json");
  const projects = ["--project", "web", "--project", "web-clock"];
  const ran = await run("node_modules/.bin/vitest", [
    "run",
    ...projects,
    "--reporter=json",
    `--outputFile=${output}`,
    ...files,
  ]);
  const report = readReport(output);
  return {
    failures: vitestFailures({ base: process.cwd(), report }),
    stopped: ran.stopped,
    tests: vitestCount(report),
  };
}

async function browserOutcome({ files }: Suite): Promise<Outcome> {
  rmSync(BROWSER_REPORT, { force: true });
  const ran = await run("node_modules/.bin/playwright", ["test", ...files]);
  const report = readReport(BROWSER_REPORT);
  return {
    failures: playwrightFailures({ base: BROWSER_DIR, report }),
    stopped: ran.stopped,
    tests: playwrightCount(report),
  };
}

const nothingRun: Outcome = { failures: [], stopped: false, tests: NONE };

function both(web: Outcome, browser: Outcome): Outcome {
  return {
    failures: [...web.failures, ...browser.failures],
    stopped: web.stopped || browser.stopped,
    tests: web.tests + browser.tests,
  };
}

async function wholeSuite(directory: string): Promise<Outcome> {
  return both(await webOutcome({ directory, files: [] }), await browserOutcome({ directory, files: [] }));
}

async function fileOutcomes(suite: Suite): Promise<Outcome> {
  const web = suite.files.filter((file) => file.endsWith(".tsx"));
  const browser = suite.files.filter((file) => file.endsWith(".browser.test.ts"));
  let webRun = nothingRun;
  let browserRun = nothingRun;
  if (web.length > NONE) {
    webRun = await webOutcome({ directory: suite.directory, files: web });
  }
  if (browser.length > NONE) {
    browserRun = await browserOutcome({ directory: suite.directory, files: browser });
  }
  return both(webRun, browserRun);
}

async function underLoad(directory: string): Promise<Outcome> {
  console.error(`${SCRIPT}: the web and browser tests, with ${String(workerCount)} busy workers`);
  const busy = Array.from({ length: workerCount }, () =>
    spawn(process.execPath, ["-e", BUSY_LOOP, String(runLimitMs)], { stdio: "ignore" }),
  );
  try {
    return await wholeSuite(directory);
  } finally {
    for (const worker of busy) {
      worker.kill();
    }
  }
}

interface Verdict {
  readonly loaded: Outcome;
  readonly onlyUnderLoad: readonly FailedTest[];
  readonly stopped: boolean;
}

function verdict({ loaded, onlyUnderLoad, stopped }: Verdict): string {
  if (loaded.tests === NONE) {
    return "RESULT: FAIL (no test ran under load: read the errors above)";
  }
  if (stopped) {
    return `RESULT: FAIL (a run was stopped at the ${values.minutes}-minute limit)`;
  }
  if (onlyUnderLoad.length === NONE) {
    return "RESULT: PASS";
  }
  return `RESULT: FAIL (${String(onlyUnderLoad.length)} tests fail only under load)`;
}

function printList(title: string, tests: readonly FailedTest[]): void {
  if (tests.length > NONE) {
    console.log(`${title}:\n${failureList(tests)}`);
  }
}

async function main(directory: string): Promise<boolean> {
  const loaded = await underLoad(directory);
  const files = filesOf(loaded.failures);
  console.error(
    `${SCRIPT}: ${String(loaded.failures.length)} of ${String(loaded.tests)} tests failed under load; rerunning their ${String(files.length)} files alone`,
  );
  const alone = await fileOutcomes({ directory, files });
  const onlyUnderLoad = failingOnlyUnderLoad({ alone: alone.failures, underLoad: loaded.failures });
  printList("Failed alone too, so not load", alone.failures);
  printList("Failed only under load", onlyUnderLoad);
  const stopped = loaded.stopped || alone.stopped;
  console.log(verdict({ loaded, onlyUnderLoad, stopped }));
  return stopped || loaded.failures.length > NONE || loaded.tests === NONE;
}

const release = await holdMachineLock({
  file: SUITE_LOCK_FILE,
  onWait: (holder) => {
    console.error(waitingLine({ holder, script: SCRIPT }));
  },
  pollMs: LOCK_POLL_MS,
  worktree: process.cwd(),
});
const directory = mkdtempSync(path.join(tmpdir(), "under-load-"));
try {
  process.exitCode = Number(await main(directory));
} finally {
  rmSync(directory, { force: true, recursive: true });
  release();
}
