import { slowBrowserArguments, slowBrowserRun } from "./lib/browser-slow.ts";
import { spawnSync } from "node:child_process";

const FIRST_ARGUMENT = 2;
const EXIT_FAILURE = 1;
const PASSED = 0;

const parsed = slowBrowserArguments(process.argv.slice(FIRST_ARGUMENT));

if (parsed.ok) {
  const { args, command } = slowBrowserRun(parsed);
  const { status } = spawnSync(command, [...args], { stdio: "inherit" });
  if (status === PASSED) {
    console.log("RESULT: PASS");
  } else {
    console.log(`RESULT: FAIL (browser tests with every board call delayed ${String(parsed.delayMs)} ms)`);
    process.exitCode = EXIT_FAILURE;
  }
} else {
  console.error("usage: pnpm browser:slow [ms, default 700] <browser test file> [-g <title>]");
  console.log("RESULT: FAIL (usage)");
  process.exitCode = EXIT_FAILURE;
}
