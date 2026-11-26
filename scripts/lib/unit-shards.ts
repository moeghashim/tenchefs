import type { Plan, Planning } from "./timed-shards.ts";
import { field, list, parseJson, text } from "./json.ts";
import type { Outcome } from "./tools.ts";
import path from "node:path";
import { readTimings } from "./slowest-files.ts";
import { shardPlan } from "./timed-shards.ts";
import { spawnSync } from "node:child_process";

const BLOB_DIR = ".vitest/blob";
const VITEST = "node_modules/vitest/vitest.mjs";
const EXIT_SUCCESS = 0;

interface UnitPlanning extends Planning {
  readonly cwd: string;
}

function listedFile(entry: unknown, cwd: string): readonly string[] {
  const file = text(field(entry, "file")) ?? "";
  if (file === "") {
    return [];
  }
  return [path.relative(cwd, file)];
}

function unitTestFiles(cwd: string): Outcome<readonly string[]> {
  const listed = spawnSync(process.execPath, [VITEST, "list", "--filesOnly", "--json"], { cwd, encoding: "utf8" });
  if (listed.status !== EXIT_SUCCESS) {
    return { ok: false, reason: `vitest list failed: ${listed.stderr.trim()}` };
  }
  const files = (list(parseJson(listed.stdout)) ?? []).flatMap((entry) => listedFile(entry, cwd));
  return { ok: true, value: [...new Set(files)].toSorted() };
}

function unitShardPlan({ cwd, ...planning }: UnitPlanning): Plan {
  return shardPlan({
    ...planning,
    recording: {
      fallback: "file count",
      name: "unit",
      prefix: "test-timings-tests-",
      read: (file) => readTimings({ base: cwd, file, runner: "vitest" }),
      report: "tests.json",
      runArgs: (shard, files) => [
        `--outputFile.blob=${BLOB_DIR}/blob-${shard.replace("/", "-")}.json`,
        ...files.map((file) => path.join(cwd, file)),
      ],
    },
  });
}

export { unitShardPlan, unitTestFiles };
