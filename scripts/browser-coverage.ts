import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { shardFile } from "./lib/coverage-shards.ts";
import { spawnSync } from "node:child_process";
import { testCoverageFrom } from "./lib/browser-coverage.ts";

const OUTPUT = ".browser-coverage";
const RECORDS = path.join(OUTPUT, "records");
const MAP = path.join(OUTPUT, "map.json");
const FIRST_ARGUMENT = 2;
const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;

rmSync(OUTPUT, { force: true, recursive: true });
mkdirSync(RECORDS, { recursive: true });

const ran = spawnSync("pnpm", ["exec", "playwright", "test", ...process.argv.slice(FIRST_ARGUMENT)], {
  stdio: "inherit",
});

function records(): readonly string[] {
  return readdirSync(RECORDS)
    .filter((file) => file.endsWith(".jsonl"))
    .flatMap((file) => readFileSync(path.join(RECORDS, file), "utf8").split("\n"))
    .filter((line) => line !== "");
}

const SHARD_PREFIX = "--shard=";
const shard = (process.argv.find((arg) => arg.startsWith(SHARD_PREFIX)) ?? `${SHARD_PREFIX}1/1`).slice(
  SHARD_PREFIX.length,
);

if (ran.status === EXIT_SUCCESS) {
  const commit = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  const map = shardFile({ commit, coverage: records().map((line) => testCoverageFrom(line)), shard });
  if (map.ok) {
    writeFileSync(MAP, map.value);
    console.log(`browser-coverage: wrote ${MAP} for shard ${shard}.`);
  } else {
    console.error(`browser-coverage: no coverage map, since ${map.reason}.`);
  }
}

process.exitCode = ran.status ?? EXIT_FAILURE;
