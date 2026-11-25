import type { FileCoverage, PageCoverage, Span } from "./page-coverage.ts";
import { field, list, parseJson, text } from "./json.ts";
import type { Outcome } from "./tools.ts";
import { okEntry } from "./page-coverage.ts";

interface Recorded {
  readonly files: PageCoverage;
  readonly test: string;
}

interface Incomplete {
  readonly incomplete: string;
  readonly test: string;
}

type TestCoverage = Incomplete | Recorded;

type SpansByFile = Readonly<Record<string, readonly Span[]>>;

interface CoverageMap {
  readonly commit: string;
  readonly files: SpansByFile;
  readonly tests: Readonly<Record<string, SpansByFile>>;
}
type FileSpans = readonly [string, readonly Span[]];
interface Reach {
  readonly changed: readonly Span[];
  readonly file: string;
  readonly map: CoverageMap;
}

const NOT_A_SPAN = "";
const NEXT = 1;
const NONE = 0;
const UNREADABLE: Outcome<CoverageMap> = { ok: false, reason: "the coverage map isn't one this check can read" };

function spanKey([first, last]: Span): string {
  return `${String(first)}:${String(last)}`;
}

function union(spans: readonly Span[]): readonly Span[] {
  return [...new Map(spans.map((span) => [spanKey(span), span])).values()].toSorted(([left], [right]) => left - right);
}

function merged(pairs: readonly FileSpans[]): SpansByFile {
  const grouped = Map.groupBy(pairs, ([file]) => file);
  return Object.fromEntries(
    [...grouped].map(([file, entries]: readonly [string, readonly FileSpans[]]) => [
      file,
      union(entries.flatMap(([, spans]) => spans)),
    ]),
  );
}

function isIncomplete(test: TestCoverage): test is Incomplete {
  return "incomplete" in test;
}

function isRecorded(test: TestCoverage): test is Recorded {
  return "files" in test;
}

function testsOf(recorded: readonly Recorded[]): Readonly<Record<string, SpansByFile>> {
  const byTest = Map.groupBy(recorded, ({ test }) => test);
  const tests = [...byTest].map(([test, pages]: readonly [string, readonly Recorded[]]) => {
    const ran = pages.flatMap(({ files }) =>
      Object.entries(files).map(([file, { called }]: readonly [string, FileCoverage]): FileSpans => [file, called]),
    );
    return [test, merged(ran)] as const;
  });
  return Object.fromEntries(tests.toSorted(([left], [right]) => left.localeCompare(right)));
}

function coverageMapOf({
  commit,
  coverage,
}: {
  readonly commit: string;
  readonly coverage: readonly TestCoverage[];
}): Outcome<CoverageMap> {
  const unattributed = coverage.filter((test) => isIncomplete(test)).filter(({ test }) => test === "");
  if (unattributed.length > NONE) {
    return { ok: false, reason: unattributed.map(({ incomplete }) => incomplete).join("; ") };
  }
  const incomplete = new Set(coverage.filter((test) => isIncomplete(test)).map(({ test }) => test));
  const recorded = coverage.filter((test) => isRecorded(test)).filter(({ test }) => !incomplete.has(test));
  const files = recorded.flatMap((page) =>
    Object.entries(page.files).map(
      ([file, { functions }]: readonly [string, FileCoverage]): FileSpans => [file, functions],
    ),
  );
  return { ok: true, value: { commit, files: merged(files), tests: testsOf(recorded) } };
}

function innermost(functions: readonly Span[], [first, last]: Span): readonly Span[] {
  return functions
    .filter(([start, end]) => start < first && last < end)
    .toSorted(([leftStart, leftEnd], [rightStart, rightEnd]) => leftEnd - leftStart - (rightEnd - rightStart))
    .slice(NONE, NEXT);
}

function reaches(called: readonly Span[], functions: readonly Span[], changed: readonly Span[]): boolean {
  const keys = new Set(called.map((span) => spanKey(span)));
  return changed.some((lines) => {
    const around = innermost(functions, lines);
    return around.length === NONE || around.some((span) => keys.has(spanKey(span)));
  });
}

function testsReaching({ changed, file, map }: Reach): Outcome<readonly string[]> {
  if (!Object.hasOwn(map.files, file)) {
    return { ok: false, reason: `the coverage map doesn't hold ${file}` };
  }
  const functions = map.files[file] ?? [];
  const reaching = Object.entries(map.tests).filter(
    ([, ran]: readonly [string, SpansByFile]) =>
      Object.hasOwn(ran, file) && reaches(ran[file] ?? [], functions, changed),
  );
  return { ok: true, value: reaching.map(([test]: readonly [string, SpansByFile]) => test) };
}

function spanFrom(item: unknown): readonly Span[] {
  const [first, last] = list(item) ?? [];
  if (typeof first !== "number" || typeof last !== "number") {
    return [];
  }
  return [[first, last]];
}

function spansFrom(value: unknown): Outcome<readonly Span[]> {
  const items = list(value) ?? [NOT_A_SPAN];
  const spans = items.flatMap((item) => spanFrom(item));
  if (spans.length !== items.length) {
    return { ok: false, reason: "not a list of spans" };
  }
  return { ok: true, value: spans };
}

function recordFrom<Value>(
  value: unknown,
  read: (item: unknown) => Outcome<Value>,
): Outcome<Readonly<Record<string, Value>>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "not an object" };
  }
  const outcomes = Object.entries(value).map(([key, item]: readonly [string, unknown]) => [key, read(item)] as const);
  const entries = outcomes.flatMap((entry) => okEntry(entry));
  if (entries.length !== outcomes.length) {
    return { ok: false, reason: "an entry can't be read" };
  }
  return { ok: true, value: Object.fromEntries(entries) };
}

function spansByFileFrom(value: unknown): Outcome<SpansByFile> {
  return recordFrom(value, spansFrom);
}

function parseCoverageMap(json: unknown): Outcome<CoverageMap> {
  const commit = text(field(json, "commit")) ?? "";
  const files = spansByFileFrom(field(json, "files"));
  const tests = recordFrom(field(json, "tests"), spansByFileFrom);
  if (commit === "" || !files.ok || !tests.ok) {
    return UNREADABLE;
  }
  return { ok: true, value: { commit, files: files.value, tests: tests.value } };
}

function fileCoverageFrom(value: unknown): Outcome<FileCoverage> {
  const called = spansFrom(field(value, "called"));
  const functions = spansFrom(field(value, "functions"));
  if (!called.ok || !functions.ok) {
    return { ok: false, reason: "not a file's coverage" };
  }
  return { ok: true, value: { called: called.value, functions: functions.value } };
}

function testCoverageFrom(line: string): TestCoverage {
  const json = parseJson(line);
  const test = text(field(json, "test")) ?? "";
  const incomplete = text(field(json, "incomplete")) ?? "";
  if (incomplete !== "") {
    return { incomplete, test };
  }
  const files = recordFrom(field(json, "files"), fileCoverageFrom);
  if (!files.ok) {
    return { incomplete: "its coverage record couldn't be read", test };
  }
  return { files: files.value, test };
}

function coverageMapFrom(source: string): Outcome<CoverageMap> {
  return parseCoverageMap(parseJson(source));
}

export type { CoverageMap, TestCoverage };
export { coverageMapFrom, coverageMapOf, testCoverageFrom, testsReaching };
