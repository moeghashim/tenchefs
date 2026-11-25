import { slowArguments, slowRun } from "./lib/web-slow.ts";
import { startVitest } from "vitest/node";

const FIRST_ARGUMENT = 2;
const EXIT_FAILURE = 1;
const NONE = 0;

const parsed = slowArguments(process.argv.slice(FIRST_ARGUMENT));

if (parsed.ok) {
  const { files, options } = slowRun(parsed);
  const runner = await startVitest([...files], { ...options, project: [...options.project] });
  await runner.close();
  if (runner.state.getCountOfFailedTests() > NONE || process.exitCode === EXIT_FAILURE) {
    console.log(`RESULT: FAIL (web tests with every view call delayed ${String(parsed.delayMs)} ms)`);
    process.exitCode = EXIT_FAILURE;
  } else {
    console.log("RESULT: PASS");
  }
} else {
  console.error("usage: pnpm web:slow [ms, default 700] <web test files...>");
  console.log("RESULT: FAIL (usage)");
  process.exitCode = EXIT_FAILURE;
}
