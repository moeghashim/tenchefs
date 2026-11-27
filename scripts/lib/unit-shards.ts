import { COSTS_REPORT, readCosts } from "./file-costs.ts";
import type { Plan, Planning } from "./timed-shards.ts";
import { field, list, parseJson, text } from "./json.ts";
import type { FileTiming } from "./slowest-files.ts";
import type { Outcome } from "./tools.ts";
import path from "node:path";
import { readTimings } from "./slowest-files.ts";
import { shardPlan } from "./timed-shards.ts";
import { spawnSync } from "node:child_process";

const BLOB_DIR = ".vitest/blob";
const VITEST = "node_modules/vitest/vitest.mjs";
const EXIT_SUCCESS = 0;
const NONE = 0;

interface UnitTestFiles {
  readonly files: Outcome<readonly string[]>;
  readonly projects: ReadonlyMap<string, string>;
}

interface UnitPlanning extends Planning {
  readonly cwd: string;
  readonly projects?: ReadonlyMap<string, string>;
}

function listedFile(entry: unknown, cwd: string): readonly (readonly [string, string])[] {
  const file = text(field(entry, "file")) ?? "";
  if (file === "") {
    return [];
  }
  return [[path.relative(cwd, file), text(field(entry, "projectName")) ?? ""]];
}

function unitTestFiles(cwd: string): UnitTestFiles {
  const listed = spawnSync(process.execPath, [VITEST, "list", "--filesOnly", "--json"], { cwd, encoding: "utf8" });
  if (listed.status !== EXIT_SUCCESS) {
    return { files: { ok: false, reason: `vitest list failed: ${listed.stderr.trim()}` }, projects: new Map() };
  }
  const projects = new Map((list(parseJson(listed.stdout)) ?? []).flatMap((entry) => listedFile(entry, cwd)));
  return { files: { ok: true, value: [...projects.keys()].toSorted() }, projects };
}

function recordedCosts(report: string, cwd: string): readonly FileTiming[] {
  const costs = readCosts(path.join(path.dirname(report), COSTS_REPORT));
  if (costs.length > NONE) {
    return costs;
  }
  return readTimings({ base: cwd, file: report, runner: "vitest" });
}

function unitShardPlan({ cwd, projects = new Map(), ...planning }: UnitPlanning): Plan {
  return shardPlan({
    ...planning,
    groupOf: (file) => projects.get(file) ?? "",
    recording: {
      fallback: "file count",
      name: "unit",
      prefix: "test-timings-tests-",
      read: (file) => recordedCosts(file, cwd),
      report: "tests.json",
      runArgs: (shard, files) => [
        `--outputFile.blob=${BLOB_DIR}/blob-${shard.replace("/", "-")}.json`,
        ...files.map((file) => path.join(cwd, file)),
      ],
    },
  });
}

export { unitShardPlan, unitTestFiles };
