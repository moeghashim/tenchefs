import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { field, list, parseJson, text } from "./json.ts";
import type { CoverageMap } from "./browser-coverage.ts";
import type { Outcome } from "./tools.ts";
import { coverageMapFrom } from "./browser-coverage.ts";
import { mergedShards } from "./coverage-shards.ts";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

type Gh = (args: readonly string[]) => Outcome<string>;

interface Fetching {
  readonly base: string;
  readonly cwd: string;
  readonly gh: Gh;
}

interface Cache {
  readonly file: string;
  readonly mergeBase: string;
}

interface Recording {
  readonly commit: string;
  readonly run: string;
}

const ARTIFACT = "browser-coverage-map";
const FIRST_SHARD = `${ARTIFACT}-1`;
const MAP_FILE = "map.json";
const CACHE = "cookout-browser-coverage";
const LISTING = `repos/{owner}/{repo}/actions/artifacts?name=${FIRST_SHARD}&per_page=100`;
const GH_TIMEOUT_MS = 60_000;
const EXIT_SUCCESS = 0;
const NONE = 0;
const NONE_ON_BASE: Outcome<Recording> = {
  ok: false,
  reason: "CI has recorded none for a commit on this branch's base",
};

function git(cwd: string, args: readonly string[]): Outcome<string> {
  const ran = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (ran.status !== EXIT_SUCCESS) {
    return { ok: false, reason: `git ${args.join(" ")} failed: ${ran.stderr.trim()}` };
  }
  return { ok: true, value: ran.stdout.trim() };
}

function ghCli(cwd: string): Gh {
  return (args) => {
    const ran = spawnSync("gh", args, { cwd, encoding: "utf8", timeout: GH_TIMEOUT_MS });
    if (ran.status !== EXIT_SUCCESS) {
      return { ok: false, reason: `gh ${args.join(" ")} failed: ${`${ran.stderr}${String(ran.error ?? "")}`.trim()}` };
    }
    return { ok: true, value: ran.stdout };
  };
}

function onBase(cwd: string, commit: string, base: string): boolean {
  return spawnSync("git", ["merge-base", "--is-ancestor", commit, base], { cwd }).status === EXIT_SUCCESS;
}

function recordingOf(artifact: unknown): readonly Recording[] {
  const commit = text(field(field(artifact, "workflow_run"), "head_sha")) ?? "";
  const run = field(field(artifact, "workflow_run"), "id");
  if (field(artifact, "expired") !== false || commit === "" || typeof run !== "number") {
    return [];
  }
  return [{ commit, run: String(run) }];
}

function newestOnBase(listing: string, cwd: string, base: string): Outcome<Recording> {
  const artifacts = list(field(parseJson(listing), "artifacts")) ?? [];
  const recordings = artifacts.flatMap((artifact) => recordingOf(artifact));
  const found = recordings
    .filter(({ commit }) => onBase(cwd, commit, base))
    .map((recording): Outcome<Recording> => ({ ok: true, value: recording }));
  return found[NONE] ?? NONE_ON_BASE;
}

function downloaded(gh: Gh, { run }: Recording): Outcome<CoverageMap> {
  const dir = mkdtempSync(path.join(tmpdir(), "browser-coverage-"));
  try {
    const ran = gh(["run", "download", run, "--pattern", `${ARTIFACT}-*`, "--dir", dir]);
    if (!ran.ok) {
      return ran;
    }
    const sources = readdirSync(dir, { encoding: "utf8", recursive: true })
      .filter((file) => path.basename(file) === MAP_FILE)
      .map((file) => readFileSync(path.join(dir, file), "utf8"));
    return mergedShards(sources);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

function cached(file: string, map: CoverageMap): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const partial = `${file}.${String(process.pid)}`;
  writeFileSync(partial, JSON.stringify(map));
  renameSync(partial, file);
}

function cacheFile(cwd: string, base: string): Outcome<Cache> {
  const mergeBase = git(cwd, ["merge-base", "HEAD", base]);
  if (!mergeBase.ok) {
    return mergeBase;
  }
  const common = git(cwd, ["rev-parse", "--git-common-dir"]);
  if (!common.ok) {
    return common;
  }
  return {
    ok: true,
    value: { file: path.resolve(cwd, common.value, CACHE, `${mergeBase.value}.json`), mergeBase: mergeBase.value },
  };
}

function fromCi({ cwd, gh }: Fetching, { file, mergeBase }: Cache): Outcome<CoverageMap> {
  const listing = gh(["api", LISTING]);
  if (!listing.ok) {
    return listing;
  }
  const newest = newestOnBase(listing.value, cwd, mergeBase);
  if (!newest.ok) {
    return newest;
  }
  const map = downloaded(gh, newest.value);
  if (map.ok) {
    cached(file, map.value);
  }
  return map;
}

function fetchedCoverageMap(fetching: Fetching): Outcome<CoverageMap> {
  const cache = cacheFile(fetching.cwd, fetching.base);
  if (!cache.ok) {
    return cache;
  }
  if (existsSync(cache.value.file)) {
    return coverageMapFrom(readFileSync(cache.value.file, "utf8"));
  }
  return fromCi(fetching, cache.value);
}

export { fetchedCoverageMap, ghCli };
