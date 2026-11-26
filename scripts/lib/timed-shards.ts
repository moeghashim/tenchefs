import type { Gh, Reading, Recorded, Timings } from "./recorded-timings.ts";
import type { FileTiming } from "./slowest-files.ts";
import type { Outcome } from "./tools.ts";
import { readTimings } from "./slowest-files.ts";
import { recordedTimings } from "./recorded-timings.ts";

interface Splitting {
  readonly files: readonly string[];
  readonly name: string;
  readonly shard: string;
  readonly timings: readonly FileTiming[];
}

interface Split {
  readonly files: readonly string[];
  readonly seconds: number;
}

interface Fetching {
  readonly gh: Gh;
  readonly run: string;
}

interface Shard {
  readonly index: number;
  readonly total: number;
}

interface Planning extends Fetching {
  readonly files: Outcome<readonly string[]>;
  readonly shard: string;
}

interface Recording extends Timings {
  readonly fallback: string;
  readonly fallbackArgs?: (shard: string, files: Outcome<readonly string[]>) => readonly string[];
  readonly runArgs: (shard: string, files: readonly string[]) => readonly string[];
}

interface Asking extends Fetching {
  readonly recording: Recording;
}

interface Plan {
  readonly args: readonly string[];
  readonly failure: string;
  readonly line: string;
}

const BROWSER_TESTS = "app/modules/routes/tests/browser";
const SHARD = /^(?<index>\d+)\/(?<total>\d+)$/v;
const FIRST = 1;
const NONE = 0;
const DECIMALS = 1;
const EMPTY: Split = { files: [], seconds: NONE };

function boundsOf(label: string): Shard {
  const [, index = "", total = ""] = SHARD.exec(label) ?? [];
  return { index: Number(index), total: Number(total) };
}

function shardOf(label: string): Outcome<Shard> {
  const shard = boundsOf(label);
  if (shard.index < FIRST || shard.index > shard.total) {
    return { ok: false, reason: `${label} isn't a shard such as 1/3` };
  }
  return { ok: true, value: shard };
}

function recordedSeconds(files: readonly string[], timings: readonly FileTiming[]): ReadonlyMap<string, number> {
  const recorded = new Map<string, number>();
  for (const { file, seconds } of timings.filter((timing) => files.includes(timing.file))) {
    recorded.set(file, (recorded.get(file) ?? NONE) + seconds);
  }
  return recorded;
}

function sum(values: readonly number[]): number {
  let total = NONE;
  for (const value of values) {
    total += value;
  }
  return total;
}

function weighed(files: readonly string[], recorded: ReadonlyMap<string, number>): readonly FileTiming[] {
  const average = sum([...recorded.values()]) / recorded.size;
  return files
    .map((file): FileTiming => ({ file, seconds: recorded.get(file) ?? average }))
    .toSorted((left, right) => right.seconds - left.seconds || left.file.localeCompare(right.file));
}

function withFile(shards: readonly Split[], { file, seconds }: FileTiming): readonly Split[] {
  const least = Math.min(...shards.map((shard) => shard.seconds));
  const at = shards.findIndex((shard) => shard.seconds === least);
  return shards.map((shard, index) => {
    if (index !== at) {
      return shard;
    }
    return { files: [...shard.files, file], seconds: shard.seconds + seconds };
  });
}

function split(weights: readonly FileTiming[], { index, total }: Shard): Split {
  let shards: readonly Split[] = Array.from({ length: total }, () => EMPTY);
  for (const weight of weights) {
    shards = withFile(shards, weight);
  }
  const { files, seconds } = shards[index - FIRST] ?? EMPTY;
  return { files: files.toSorted(), seconds };
}

function shardByTime({ files, name, shard, timings }: Splitting): Outcome<Split> {
  const parsed = shardOf(shard);
  if (!parsed.ok) {
    return parsed;
  }
  const recorded = recordedSeconds(files, timings);
  if (recorded.size === NONE) {
    return { ok: false, reason: `no ${name} test file has a recorded time` };
  }
  return { ok: true, value: split(weighed(files, recorded), parsed.value) };
}

interface Timed {
  readonly all: readonly string[];
  readonly recorded: Recorded;
}

function recordedFor({ files, gh, run }: Planning, recording: Recording): Reading<Timed> {
  if (!files.ok) {
    return { kind: "unrecorded", reason: files.reason };
  }
  if (run === "") {
    return { kind: "unrecorded", reason: "this isn't a GitHub Actions run" };
  }
  const recorded = recordedTimings({ gh, recording, run });
  if (recorded.kind !== "read") {
    return recorded;
  }
  return { kind: "read", value: { all: files.value, recorded: recorded.value } };
}

function timedPlan(planning: Planning, recording: Recording): Reading<Plan> {
  const found = recordedFor(planning, recording);
  if (found.kind !== "read") {
    return found;
  }
  const { all, recorded } = found.value;
  const timed = shardByTime({ files: all, name: recording.name, shard: planning.shard, timings: recorded.timings });
  if (!timed.ok) {
    return { kind: "unrecorded", reason: timed.reason };
  }
  const { files, seconds } = timed.value;
  const line = `${recording.name} shard ${planning.shard}: ${String(files.length)} of ${String(all.length)} files, ${seconds.toFixed(DECIMALS)}s of test time as run ${recorded.run} recorded it`;
  return { kind: "read", value: { args: recording.runArgs(planning.shard, files), failure: "", line } };
}

function shardPlan({ recording, ...planning }: Planning & Asking): Plan {
  const timed = timedPlan(planning, recording);
  if (timed.kind === "read") {
    return timed.value;
  }
  if (timed.kind === "unreadable") {
    return {
      args: [],
      failure: `${recording.name} shard ${planning.shard} can't read the recorded timings, and a split of its own would differ from the other shards': ${timed.reason}`,
      line: "",
    };
  }
  const { fallbackArgs = (shard: string): readonly string[] => [`--shard=${shard}`] } = recording;
  return {
    args: fallbackArgs(planning.shard, planning.files),
    failure: "",
    line: `${recording.name} shard ${planning.shard}: split by ${recording.fallback}, since ${timed.reason}`,
  };
}

const BROWSER: Recording = {
  fallback: "test count",
  name: "browser",
  prefix: "test-timings-browser-",
  read: (file) => readTimings({ base: BROWSER_TESTS, file, runner: "playwright" }),
  report: "browser.json",
  runArgs: (shard, files) => [`--record-shard=${shard}`, ...files],
};

function browserShardPlan(planning: Planning): Plan {
  return shardPlan({ ...planning, recording: BROWSER });
}

export type { Planning, Plan, Recording };
export { BROWSER, browserShardPlan, shardOf, shardPlan };
