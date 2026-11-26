import { landedToLiveTimes, landingTimes, releaseGateTimes, v1CheckTimes } from "./lib/budget-sources.ts";
import { localStageTimes, readStageLog } from "./lib/stage-log.ts";
import type { Outcome } from "./lib/tools.ts";
import { budgetReport } from "./lib/budgets.ts";
import { ghCli } from "./lib/coverage-map-fetch.ts";
import { spawnSync } from "node:child_process";
import { verdictLine } from "./lib/verdict.ts";

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const FETCH_TIMEOUT_MS = 20_000;
const cwd = process.cwd();

function git(args: readonly string[]): Outcome<string> {
  const ran = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (ran.status !== EXIT_SUCCESS) {
    return { ok: false, reason: `git ${args.join(" ")} failed: ${ran.stderr.trim()}` };
  }
  return { ok: true, value: ran.stdout };
}

spawnSync("git", ["fetch", "--quiet", "--no-tags", "origin", "v1", "+refs/tags/deploy/*:refs/tags/deploy/*"], {
  cwd,
  stdio: "ignore",
  timeout: FETCH_TIMEOUT_MS,
});

const gh = ghCli(cwd);
const log = readStageLog(cwd);
const report = budgetReport({
  "Release gate": releaseGateTimes(gh),
  "landed to live": landedToLiveTimes({ gh, git }),
  landing: landingTimes(gh),
  "pnpm check": localStageTimes({ log, stage: "pnpm check" }),
  "pre-commit": localStageTimes({ log, stage: "pre-commit" }),
  "v1 Check": v1CheckTimes(gh),
});
for (const line of [...report.lines, report.verdict]) {
  console.log(line);
}
process.exitCode = EXIT_SUCCESS;
if (report.verdict !== verdictLine([])) {
  process.exitCode = EXIT_FAILURE;
}
