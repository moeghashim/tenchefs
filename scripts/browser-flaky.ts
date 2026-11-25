import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { flakyArguments, flakyReport } from "./lib/browser-flaky.ts";
import { osReading, quietMachine } from "./lib/machine-load.ts";
import { parseJson } from "./lib/json.ts";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const FIRST_ARGUMENT = 2;
const EXIT_FAILURE = 1;
const LOAD_LIMIT = 20;
const RECHECK_MS = 15_000;

const parsed = flakyArguments(process.argv.slice(FIRST_ARGUMENT));

function reportIn(output: string): unknown {
  if (!existsSync(output)) {
    return null;
  }
  return parseJson(readFileSync(output, "utf8"));
}

interface FlakyRun {
  readonly file: string;
  readonly grep: readonly string[];
  readonly repeats: number;
}

async function rechecked(): Promise<void> {
  await sleep(RECHECK_MS);
}

function run({ file, grep, repeats }: FlakyRun): boolean {
  const dir = mkdtempSync(path.join(tmpdir(), "browser-flaky-"));
  const output = path.join(dir, "report.json");
  const repeat = `--repeat-each=${String(repeats)}`;
  spawnSync(
    "env",
    [
      `PLAYWRIGHT_JSON_OUTPUT_FILE=${output}`,
      "pnpm",
      "exec",
      "playwright",
      "test",
      file,
      ...grep,
      repeat,
      "--retries=0",
      "--reporter=dot,json",
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  const report = reportIn(output);
  rmSync(dir, { force: true, recursive: true });
  const { lines, ok } = flakyReport(report);
  console.log(lines.join("\n"));
  return ok;
}

if (parsed.ok) {
  await quietMachine({
    limit: LOAD_LIMIT,
    read: osReading,
    say: (line) => {
      console.log(`browser:flaky: ${line}`);
    },
    sleep: rechecked,
  });
  if (!run(parsed)) {
    process.exitCode = EXIT_FAILURE;
  }
} else {
  console.error("usage: pnpm browser:flaky <file> [repeats, default 25] [-g <title>]");
  console.log("RESULT: FAIL (usage)");
  process.exitCode = EXIT_FAILURE;
}
