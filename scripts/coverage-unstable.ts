import { SUITE_LOCK_FILE, holdMachineLock, waitingLine } from "./lib/machine-lock.ts";
import { attributionsIn, unstableArguments, unstableLines, unstableReport } from "./lib/coverage-unstable.ts";
import { coverageByTestFile, isV8Provider, keepingTestFiles } from "./lib/coverage-by-test.ts";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { Unstable } from "./lib/coverage-unstable.ts";
import { createVitest } from "vitest/node";
import { osReading } from "./lib/machine-load.ts";
import { parseJson } from "./lib/json.ts";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { tmpdir } from "node:os";

const SCRIPT = "coverage:unstable";
const EXIT_FAILURE = 1;
const FIRST_ARGUMENT = 2;
const FIRST_RUN = 1;
const NONE = 0;
const MAX_LOAD = 20;
const LOAD_POLL_MS = 5000;
const LOCK_POLL_MS = 1000;

interface Run {
  readonly directory: string;
  readonly report: unknown;
}

interface SuiteRun extends Run {
  readonly attribute: (sources: readonly string[], kept: readonly string[]) => Promise<readonly unknown[]>;
  readonly close: () => Promise<void>;
}

interface Finished {
  readonly ok: boolean;
  readonly runs: readonly Run[];
}

async function quietMachine(told = false): Promise<void> {
  if (osReading().load <= MAX_LOAD) {
    return;
  }
  if (!told) {
    console.error(`${SCRIPT}: waiting for the load average to fall to ${String(MAX_LOAD)} or below.`);
  }
  await sleep(LOAD_POLL_MS);
  await quietMachine(true);
}

function reportIn(directory: string, passed: boolean): unknown {
  if (!passed) {
    return null;
  }
  return parseJson(readFileSync(path.join(directory, "report", "coverage-final.json"), "utf8"));
}

async function suiteRun(run: number, runs: number): Promise<SuiteRun> {
  console.error(`${SCRIPT}: run ${String(run)} of ${String(runs)}.`);
  const directory = mkdtempSync(path.join(tmpdir(), "coverage-unstable-"));
  const suite = await createVitest({
    coverage: {
      enabled: true,
      reporter: ["json"],
      reportsDirectory: path.join(directory, "report"),
      thresholds: { branches: 0, functions: 0, lines: 0, statements: 0 },
    },
    reporters: ["dot"],
    run: true,
    watch: false,
  });
  const provider = await suite.createCoverageProvider();
  if (!isV8Provider(provider)) {
    throw new Error(`${SCRIPT}: the coverage provider isn't V8's.`);
  }
  keepingTestFiles({ directory: path.join(directory, "kept"), provider });
  const { unhandledErrors } = await suite.start();
  const passed = unhandledErrors.length === NONE && suite.state.getCountOfFailedTests() === NONE;
  return {
    attribute: async (sources, kept) => {
      const found = await coverageByTestFile({ kept, provider, sources });
      return found;
    },
    close: async () => {
      await suite.close();
    },
    directory,
    report: reportIn(directory, passed),
  };
}

async function attribution(runs: readonly Run[], last: SuiteRun, unstable: readonly Unstable[]): Promise<unknown> {
  if (unstable.length === NONE) {
    return [];
  }
  const root = process.cwd();
  const sources = [...new Set(unstable.map(({ file }) => path.join(root, file)))];
  const found = await last.attribute(
    sources,
    runs.map(({ directory }) => path.join(directory, "kept")),
  );
  return found;
}

async function verdictOf(runs: readonly Run[], last: SuiteRun): Promise<boolean> {
  const root = process.cwd();
  if (runs.some(({ report }) => report === null)) {
    console.log("RESULT: FAIL (tests)");
    return false;
  }
  const unstable = unstableLines({ root, runs: runs.map(({ report }) => report) });
  const found = attributionsIn(await attribution(runs, last, unstable));
  const report = unstableReport({ attribution: found, root, unstable });
  console.log(report.lines.join("\n"));
  return report.ok;
}

async function suiteRuns(count: number, done: readonly Run[] = []): Promise<Finished> {
  const run = await suiteRun(done.length + FIRST_RUN, count);
  const runs = [...done, { directory: run.directory, report: run.report }];
  if (runs.length < count && run.report !== null) {
    await run.close();
    return suiteRuns(count, runs);
  }
  const ok = await verdictOf(runs, run);
  await run.close();
  return { ok, runs };
}

async function main(count: number): Promise<boolean> {
  await quietMachine();
  const release = await holdMachineLock({
    file: SUITE_LOCK_FILE,
    onWait: (holder) => {
      console.error(waitingLine({ holder, script: SCRIPT }));
    },
    pollMs: LOCK_POLL_MS,
    worktree: process.cwd(),
  });
  const finished = await suiteRuns(count);
  release();
  for (const { directory } of finished.runs) {
    rmSync(directory, { force: true, recursive: true });
  }
  return finished.ok;
}

const parsed = unstableArguments(process.argv.slice(FIRST_ARGUMENT));
if (!parsed.ok) {
  console.error("usage: pnpm coverage:unstable [runs, at least 2, default 5]");
  console.log("RESULT: FAIL (usage)");
  process.exitCode = EXIT_FAILURE;
} else if (!(await main(parsed.runs))) {
  process.exitCode = EXIT_FAILURE;
}
