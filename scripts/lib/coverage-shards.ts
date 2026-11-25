import type { CoverageMap, TestCoverage } from "./browser-coverage.ts";
import { coverageMapFrom, coverageMapOf } from "./browser-coverage.ts";
import { field, list, parseJson, text } from "./json.ts";
import type { Outcome } from "./tools.ts";
import type { Span } from "./page-coverage.ts";

interface Recording {
  readonly commit: string;
  readonly coverage: readonly TestCoverage[];
  readonly shard: string;
}

interface Shards {
  readonly commit: string;
  readonly sources: readonly string[];
}

interface Shard {
  readonly coverage: readonly TestCoverage[];
  readonly index: string;
  readonly total: string;
}

const SHARD = /^(?<index>\d+)\/(?<total>\d+)$/v;
const NEXT = 1;

function shardFile({ commit, coverage, shard }: Recording): Outcome<string> {
  const map = coverageMapOf({ commit, coverage });
  if (!map.ok) {
    return map;
  }
  const incomplete = [...new Set(coverage.filter((test) => "incomplete" in test).map(({ test }) => test))].toSorted();
  return { ok: true, value: JSON.stringify({ ...map.value, incomplete, shard }) };
}

function recordsOf(map: CoverageMap): readonly TestCoverage[] {
  return Object.entries(map.tests).map(([test, ran]: readonly [string, Readonly<Record<string, readonly Span[]>>]) => ({
    files: Object.fromEntries(
      Object.entries(ran).map(([file, called]: readonly [string, readonly Span[]]) => [
        file,
        { called, functions: map.files[file] ?? [] },
      ]),
    ),
    test,
  }));
}

function shardLabel(json: unknown): readonly [string, string] {
  const [, index = "", total = ""] = SHARD.exec(text(field(json, "shard")) ?? "") ?? [];
  return [index, total];
}

function incompleteIn(json: unknown): readonly TestCoverage[] {
  return (list(field(json, "incomplete")) ?? []).map((test) => ({
    incomplete: "a shard couldn't record all of it",
    test: text(test) ?? "",
  }));
}

function shardOf(commit: string, source: string): readonly Shard[] {
  const json = parseJson(source);
  const map = coverageMapFrom(source);
  const [index, total] = shardLabel(json);
  if (!map.ok || map.value.commit !== commit || index === "") {
    return [];
  }
  return [{ coverage: [...recordsOf(map.value), ...incompleteIn(json)], index, total }];
}

function wholeRun(shards: readonly Shard[], read: number): boolean {
  const totals = new Set(shards.map(({ total }) => total));
  const indexes = new Set(shards.map(({ index }) => Number(index)));
  const [total = ""] = totals;
  const every = Array.from({ length: Number(total) }, (_unused, at) => indexes.has(at + NEXT));
  return totals.size === NEXT && shards.length === read && shards.length === Number(total) && every.every(Boolean);
}

function mergedShards({ commit, sources }: Shards): Outcome<CoverageMap> {
  const shards = sources.flatMap((source) => shardOf(commit, source));
  if (!wholeRun(shards, sources.length)) {
    return { ok: false, reason: `CI's coverage maps for ${commit} aren't every shard of one run` };
  }
  return coverageMapOf({ commit, coverage: shards.flatMap(({ coverage }) => coverage) });
}

export { mergedShards, shardFile };
