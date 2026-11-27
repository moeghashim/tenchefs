import { BROWSER, shardOf, shardPlan } from "./timed-shards.ts";
import type { Plan, Planning, Recording } from "./timed-shards.ts";
import { browserTestFiles, browserTestsFor } from "./browser-selection.ts";
import { changedLines, unchangedSince } from "./changed-lines.ts";
import { fetchedCoverageMap, ghCli } from "./coverage-map-fetch.ts";
import type { BrowserTests } from "./browser-selection.ts";
import type { Download } from "./recorded-timings.ts";
import type { Outcome } from "./tools.ts";

interface ReachedShard {
  readonly cwd: string;
  readonly download?: Download;
  readonly gh: Planning["gh"];
  readonly run: string;
  readonly shard: string;
  readonly tests: BrowserTests;
}

interface ReachedPlan {
  readonly args: readonly string[];
  readonly failure: string;
  readonly lines: readonly string[];
  readonly nothing: string;
}

interface Since {
  readonly base: string;
  readonly changed: Outcome<readonly string[]>;
  readonly cwd: string;
}

const FIRST = 1;
const NONE = 0;

function everyNthFile(shard: string, files: Outcome<readonly string[]>): readonly string[] {
  const parsed = shardOf(shard);
  if (!files.ok || !parsed.ok) {
    return [`--shard=${shard}`];
  }
  const { index, total } = parsed.value;
  return files.value.filter((_file, at) => at % total === index - FIRST);
}

const REACHED: Recording = {
  ...BROWSER,
  fallback: "file count",
  fallbackArgs: everyNthFile,
  runArgs: (_shard, files) => files,
};

function reachedBrowserShardPlan(planning: Planning): Plan {
  return shardPlan({ ...planning, recording: REACHED });
}

function reachedFiles(cwd: string, tests: BrowserTests): Outcome<readonly string[]> {
  if (tests.all) {
    return browserTestFiles(cwd);
  }
  return { ok: true, value: tests.run };
}

function reachedLine(tests: BrowserTests): string {
  if (tests.all) {
    return "";
  }
  const total = tests.run.length + tests.skipped.length;
  return `check: this change reaches ${String(tests.run.length)} of ${String(total)} browser test files.`;
}

function reachedShard({ cwd, tests, ...fetching }: ReachedShard): ReachedPlan {
  const { shard } = fetching;
  const line = reachedLine(tests);
  if (!tests.all && tests.run.length === NONE) {
    return {
      args: [],
      failure: "",
      lines: [line],
      nothing: "check: no browser test to run, so the browser check passes.",
    };
  }
  const plan = reachedBrowserShardPlan({ ...fetching, files: reachedFiles(cwd, tests) });
  if (plan.failure !== "") {
    return { args: [], failure: plan.failure, lines: [line], nothing: "" };
  }
  if (plan.args.length === NONE) {
    return {
      args: [],
      failure: "",
      lines: [line, plan.line],
      nothing: `check: browser shard ${shard} got none of the reached files, so it passes.`,
    };
  }
  return { args: plan.args, failure: "", lines: [line, plan.line], nothing: "" };
}

function browserTestsSince({ base, changed, cwd }: Since): BrowserTests {
  return browserTestsFor({
    changed,
    coverage: () => fetchedCoverageMap({ base, cwd, gh: ghCli(cwd) }),
    cwd,
    history: {
      changedLines: (file) => changedLines({ base, cwd, file }),
      unchangedSince: (commit, file) => unchangedSince({ base, commit, cwd, file }),
    },
  });
}

export type { ReachedPlan };
export { browserTestsSince, reachedShard };
