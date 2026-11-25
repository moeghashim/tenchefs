import { TraceMap, decodedMappings } from "@jridgewell/trace-mapping";
import type { Outcome } from "./tools.ts";
import type { SourceMapSegment } from "@jridgewell/trace-mapping";

interface Range {
  readonly count: number;
  readonly endOffset: number;
  readonly startOffset: number;
}

interface ScriptCoverage {
  readonly functions: readonly { readonly functionName: string; readonly ranges: readonly Range[] }[];
  readonly source?: string;
  readonly url: string;
}

type Span = readonly [number, number];

interface FileCoverage {
  readonly called: readonly Span[];
  readonly functions: readonly Span[];
}

type PageCoverage = Readonly<Record<string, FileCoverage>>;
interface FunctionCoverage {
  readonly called: boolean;
  readonly span: Span;
}
interface Segment {
  readonly line: number;
  readonly offset: number;
}

type Served = readonly [string, Outcome<FileCoverage>];

const APP_SOURCE = /^app\/.+\.(?:js|ts|tsx)$/v;
const INLINE_MAP = "//# sourceMappingURL=data:application/json;base64,";
const BLANK = new URL("about:blank");
const NO_SEGMENT: Segment = { line: 0, offset: 0 };
const GENERATED_ONLY = 1;
const NEXT = 1;
const NOT_FOUND = -1;
const NONE = 0;
const HALF = 2;

function appFile(url: string): string {
  const file = (URL.parse(url) ?? BLANK).pathname.slice(NEXT);
  if (!APP_SOURCE.test(file)) {
    return "";
  }
  return file;
}

function lineStarts(source: string): readonly number[] {
  const starts = [NONE];
  for (let index = source.indexOf("\n"); index !== NOT_FOUND; index = source.indexOf("\n", index + NEXT)) {
    starts.push(index + NEXT);
  }
  return starts;
}

function segmentsOf(source: string): Outcome<readonly Segment[]> {
  const at = source.lastIndexOf(INLINE_MAP);
  if (at === NOT_FOUND) {
    return { ok: false, reason: "no source map" };
  }
  const encoded = source.slice(at + INLINE_MAP.length).trim();
  const starts = lineStarts(source);
  const segments = decodedMappings(new TraceMap(Buffer.from(encoded, "base64").toString("utf8"))).flatMap(
    (line: readonly Readonly<SourceMapSegment>[], generatedLine: number) =>
      line.flatMap((segment: Readonly<SourceMapSegment>): readonly Segment[] => {
        if (segment.length === GENERATED_ONLY) {
          return [];
        }
        const [column, , originalLine] = segment;
        return [{ line: originalLine + NEXT, offset: (starts[generatedLine] ?? NONE) + column }];
      }),
  );
  return { ok: true, value: segments.toSorted((left, right) => left.offset - right.offset) };
}

function firstAtOrAfter(segments: readonly Segment[], offset: number): number {
  let low = NONE;
  let high = segments.length;
  while (low < high) {
    const middle = Math.floor((low + high) / HALF);
    if ((segments[middle] ?? NO_SEGMENT).offset < offset) {
      low = middle + NEXT;
    } else {
      high = middle;
    }
  }
  return low;
}

function spanOf(segments: readonly Segment[], { endOffset, startOffset }: Range): readonly Span[] {
  const first = firstAtOrAfter(segments, startOffset);
  const last = firstAtOrAfter(segments, endOffset) - NEXT;
  const firstLine = (segments[first] ?? NO_SEGMENT).line;
  const lastLine = (segments[last] ?? NO_SEGMENT).line;
  if (first > last || lastLine < firstLine) {
    return [];
  }
  return [[firstLine, lastLine]];
}

function fileCoverage(script: ScriptCoverage, segments: readonly Segment[]): FileCoverage {
  const { length } = script.source ?? "";
  const ranges = script.functions
    .flatMap(({ ranges: [whole] }) => whole ?? [])
    .filter((range) => range.startOffset !== NONE || range.endOffset < length);
  const functions = ranges.flatMap((range): readonly FunctionCoverage[] =>
    spanOf(segments, range).map((span) => ({ called: range.count > NONE, span })),
  );
  return {
    called: functions.filter(({ called }) => called).map(({ span }) => span),
    functions: functions.map(({ span }) => span),
  };
}

function okEntry<Value>([key, outcome]: readonly [string, Outcome<Value>]): readonly (readonly [string, Value])[] {
  if (!outcome.ok) {
    return [];
  }
  return [[key, outcome.value]];
}

function servedFile(script: ScriptCoverage): readonly Served[] {
  const file = appFile(script.url);
  if (file === "") {
    return [];
  }
  const segments = segmentsOf(script.source ?? "");
  if (!segments.ok) {
    return [[file, segments]];
  }
  return [[file, { ok: true, value: fileCoverage(script, segments.value) }]];
}

function pageCoverage(scripts: readonly ScriptCoverage[]): Outcome<PageCoverage> {
  const served = scripts.flatMap((script) => servedFile(script));
  const unmapped = served.filter(([, coverage]) => !coverage.ok).map(([file]) => file);
  if (unmapped.length > NONE) {
    return { ok: false, reason: `${unmapped.join(", ")} was served without a source map` };
  }
  return { ok: true, value: Object.fromEntries(served.flatMap((entry) => okEntry(entry))) };
}

export type { FileCoverage, PageCoverage, Span };
export { okEntry, pageCoverage };
