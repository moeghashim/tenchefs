import { expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Outcome } from "../lib/tools.ts";
import path from "node:path";
import { unitShardPlan } from "../lib/unit-shards.ts";

const CWD = "/home/runner/work/cookout/cookout";
const RUN = "900";
const MS = 1000;
const NONE = 0;

type Seconds = Readonly<Record<string, number>>;

interface Recorded {
  readonly costs: Seconds;
  readonly spans: Seconds;
}

function spansReport(spans: Seconds): string {
  const testResults = Object.entries(spans).map(([name, took]: readonly [string, number]) => ({
    endTime: took * MS,
    name: `${CWD}/${name}.test.ts`,
    startTime: 0,
  }));
  return JSON.stringify({ testResults });
}

function costsReport(costs: Seconds): string {
  const files = Object.entries(costs).map(([name, seconds]: readonly [string, number]) => ({
    file: `${name}.test.ts`,
    seconds,
  }));
  return JSON.stringify({ files });
}

function unpacked(into: string, { costs, spans }: Recorded): Outcome<string> {
  const dir = path.join(into, ".timings");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "tests.json"), spansReport(spans));
  if (Object.keys(costs).length > NONE) {
    writeFileSync(path.join(dir, "tests-costs.json"), costsReport(costs));
  }
  return { ok: true, value: "" };
}

interface Ci {
  readonly download: (artifact: string, dir: string) => Outcome<string>;
  readonly gh: (args: readonly string[]) => Outcome<string>;
}

function listed(args: readonly string[]): Outcome<string> {
  const [, target = ""] = args;
  if (target.endsWith(`/runs/${RUN}`)) {
    return { ok: true, value: JSON.stringify({ created_at: "2026-11-25T10:00:00Z" }) };
  }
  const artifact = {
    created_at: "2026-11-25T09:00:00Z",
    expired: false,
    id: 7001,
    name: "test-timings-tests-1",
    workflow_run: { id: 800 },
  };
  return { ok: true, value: JSON.stringify({ artifacts: [artifact] }) };
}

function recordedBy(recorded: Recorded): Ci {
  return { download: (_artifact, dir) => unpacked(dir, recorded), gh: listed };
}

const FILES = { ok: true, value: ["a/heavy", "a/light", "b/tiny"].map((name) => `${name}.test.ts`) } as const;
const SPANS = { "a/heavy": 50, "a/light": 6, "b/tiny": 5 };

function lines(recorded: Recorded): readonly string[] {
  const ci = recordedBy(recorded);
  return ["1/2", "2/2"].map((shard) => unitShardPlan({ ...ci, cwd: CWD, files: FILES, run: RUN, shard }).line);
}

it("a CI unit-test shard weighs each file by its whole recorded cost, setup and import included, over its tests' span", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  expect([
    lines({ costs: { "a/heavy": 10, "a/light": 60, "b/tiny": 50 }, spans: SPANS }),
    lines({ costs: {}, spans: SPANS }),
  ]).toStrictEqual([
    [
      "unit shard 1/2: 1 of 3 files, 60.0s of test time as run 800 recorded it",
      "unit shard 2/2: 2 of 3 files, 60.0s of test time as run 800 recorded it",
    ],
    [
      "unit shard 1/2: 1 of 3 files, 50.0s of test time as run 800 recorded it",
      "unit shard 2/2: 2 of 3 files, 11.0s of test time as run 800 recorded it",
    ],
  ]);
});

it("a CI unit-test shard takes its share of each Vitest project's files, since Vitest runs a shard's projects one after another", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const projects = new Map([
    ["server/one.test.ts", "server"],
    ["server/two.test.ts", "server"],
    ["web/big.test.ts", "web"],
    ["web/small.test.ts", "web"],
  ]);
  const files = { ok: true, value: [...projects.keys()] } as const;
  const ci = recordedBy({ costs: { "server/one": 30, "server/two": 30, "web/big": 40, "web/small": 20 }, spans: {} });

  expect(
    ["1/2", "2/2"].map((shard) => unitShardPlan({ ...ci, cwd: CWD, files, projects, run: RUN, shard }).args),
  ).toStrictEqual([
    ["--outputFile.blob=.vitest/blob/blob-1-2.json", `${CWD}/server/one.test.ts`, `${CWD}/web/big.test.ts`],
    ["--outputFile.blob=.vitest/blob/blob-2-2.json", `${CWD}/server/two.test.ts`, `${CWD}/web/small.test.ts`],
  ]);
});
