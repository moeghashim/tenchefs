import { expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { readCosts, writeCosts } from "../lib/file-costs.ts";
import path from "node:path";
import { stringify } from "flatted";
import { tmpdir } from "node:os";

const ROOT = "/home/runner/work/cookout/cookout";
const MS = 1000;

interface Phases {
  readonly collect: number;
  readonly environment: number;
  readonly prepare: number;
  readonly setup: number;
  readonly tests: number;
}

interface Task {
  readonly collectDuration: number;
  readonly environmentLoad: number;
  readonly filepath: string;
  readonly prepareDuration: number;
  readonly result: { readonly duration: number };
  readonly setupDuration: number;
}

function task(name: string, { collect, environment, prepare, setup, tests }: Phases): Task {
  return {
    collectDuration: collect * MS,
    environmentLoad: environment * MS,
    filepath: `${ROOT}/${name}`,
    prepareDuration: prepare * MS,
    result: { duration: tests * MS },
    setupDuration: setup * MS,
  };
}

it("a shard records each file's whole cost from its blob report: environment, worker, setup, import and tests", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  const dir = mkdtempSync(path.join(tmpdir(), "file-costs-"));
  const blobs = path.join(dir, ".vitest", "blob");
  const report = path.join(dir, ".timings", "tests-costs.json");
  mkdirSync(blobs, { recursive: true });
  const heavy = task("app/a.test.tsx", { collect: 2, environment: 1.5, prepare: 0.25, setup: 0.25, tests: 1 });
  writeFileSync(path.join(blobs, "blob-1-6.json"), stringify(["5.1.1", [heavy, { filepath: `${ROOT}/b.test.ts` }]]));
  writeCosts({ blobs, file: report, root: ROOT });

  expect([readCosts(report), readCosts(`${report}.missing`), JSON.parse(readFileSync(report, "utf8"))]).toStrictEqual([
    [
      { file: "app/a.test.tsx", seconds: 5 },
      { file: "b.test.ts", seconds: 0 },
    ],
    [],
    {
      files: [
        { file: "app/a.test.tsx", seconds: 5 },
        { file: "b.test.ts", seconds: 0 },
      ],
    },
  ]);
});
