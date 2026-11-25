import { field, list } from "./json.ts";
import path from "node:path";

interface Unstable {
  readonly covered: number;
  readonly file: string;
  readonly line: number;
  readonly runs: number;
}

interface Attribution {
  readonly coverage: unknown;
  readonly testFiles: readonly string[];
}

interface UnstableReport {
  readonly lines: readonly string[];
  readonly ok: boolean;
}

type UnstableArguments = { readonly ok: true; readonly runs: number } | { readonly ok: false };

type Hits = ReadonlyMap<number, number>;

const DEFAULT_RUNS = 5;
const FEWEST_RUNS = 2;
const NONE = 0;
const ONE = 1;
const NO_HITS: Hits = new Map();

function entries(value: unknown): readonly (readonly [string, unknown])[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.entries(value);
}

function lineHits(file: unknown): Hits {
  const statements = field(file, "statementMap");
  const hits = new Map<number, number>();
  for (const [id, count] of entries(field(file, "s"))) {
    const line = field(field(field(statements, id), "start"), "line");
    if (typeof line === "number" && typeof count === "number") {
      hits.set(line, Math.max(hits.get(line) ?? NONE, count));
    }
  }
  return hits;
}

function hitsByFile(coverage: unknown, root: string): ReadonlyMap<string, Hits> {
  return new Map(entries(coverage).map(([file, data]) => [path.relative(root, file), lineHits(data)]));
}

function reached(hits: Hits, line: number): boolean {
  return (hits.get(line) ?? NONE) > NONE;
}

function unstableInFile(file: string, hitsPerRun: readonly Hits[]): readonly Unstable[] {
  const lines = new Set(hitsPerRun.flatMap((hits) => [...hits.keys()]));
  return [...lines]
    .toSorted((left, right) => left - right)
    .map(
      (line): Unstable => ({
        covered: hitsPerRun.filter((hits) => reached(hits, line)).length,
        file,
        line,
        runs: hitsPerRun.length,
      }),
    )
    .filter(({ covered, runs }) => covered > NONE && covered < runs);
}

function unstableLines(inputs: { readonly root: string; readonly runs: readonly unknown[] }): readonly Unstable[] {
  const perRun = inputs.runs.map((coverage) => hitsByFile(coverage, inputs.root));
  const files = new Set(perRun.flatMap((byFile) => [...byFile.keys()]));
  return [...files]
    .toSorted((left, right) => left.localeCompare(right))
    .flatMap((file) =>
      unstableInFile(
        file,
        perRun.map((byFile) => byFile.get(file) ?? NO_HITS),
      ),
    );
}

function reachingTests(inputs: {
  readonly attribution: readonly Attribution[];
  readonly root: string;
  readonly unstable: Unstable;
}): readonly string[] {
  const { file, line } = inputs.unstable;
  const tests = inputs.attribution
    .filter(({ coverage }) => reached(hitsByFile(coverage, inputs.root).get(file) ?? NO_HITS, line))
    .flatMap(({ testFiles }) => testFiles.map((test) => path.relative(inputs.root, path.resolve(inputs.root, test))));
  return [...new Set(tests)].toSorted((left, right) => left.localeCompare(right));
}

function reachedBy(tests: readonly string[]): string {
  if (tests.length === NONE) {
    return "no test file the runs recorded";
  }
  return tests.join(", ");
}

function unstableLine(unstable: Unstable, tests: readonly string[]): string {
  const where = `${unstable.file}:${String(unstable.line)}`;
  return `${where} covered in ${String(unstable.covered)} of ${String(unstable.runs)} runs, reached by ${reachedBy(tests)}`;
}

function linesWord(count: number): string {
  if (count === ONE) {
    return "1 line";
  }
  return `${String(count)} lines`;
}

function unstableReport(inputs: {
  readonly attribution: readonly Attribution[];
  readonly root: string;
  readonly unstable: readonly Unstable[];
}): UnstableReport {
  if (inputs.unstable.length === NONE) {
    return { lines: ["RESULT: PASS (every line was covered in every run or in none)"], ok: true };
  }
  const lines = inputs.unstable.map((unstable) =>
    unstableLine(unstable, reachingTests({ attribution: inputs.attribution, root: inputs.root, unstable })),
  );
  const verdict = `RESULT: FAIL (${linesWord(inputs.unstable.length)} covered in some runs but not all)`;
  return { lines: [...lines, verdict], ok: false };
}

function unstableArguments([count = String(DEFAULT_RUNS)]: readonly string[]): UnstableArguments {
  const runs = Number(count);
  if (Number.isInteger(runs) && runs >= FEWEST_RUNS) {
    return { ok: true, runs };
  }
  return { ok: false };
}

function strings(value: unknown): readonly string[] {
  return (list(value) ?? []).filter((entry): entry is string => typeof entry === "string");
}

function attributionsIn(value: unknown): readonly Attribution[] {
  return (list(value) ?? []).map((entry) => ({
    coverage: field(entry, "coverage"),
    testFiles: strings(field(entry, "testFiles")),
  }));
}

export type { Unstable };
export { attributionsIn, strings, unstableArguments, unstableLines, unstableReport };
