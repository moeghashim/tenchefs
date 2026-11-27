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
  readonly source: number;
  readonly span: Span;
}
interface Segment {
  readonly line: number;
  readonly offset: number;
  readonly source: number;
}
interface SourceMapped {
  readonly segments: readonly Segment[];
  readonly sources: readonly string[];
}

type Served = readonly [string, Outcome<FileCoverage>];

const APP_SOURCE = /^app\/.+\.(?:js|ts|tsx)$/v;
const BUNDLE = /^assets\/[^\/]+\.js$/v;
const INLINE_MAP = "//# sourceMappingURL=data:application/json;";
const BASE64 = "base64,";
const BLANK = new URL("about:blank");
const NO_SEGMENT: Segment = { line: 0, offset: 0, source: -1 };
const GENERATED_ONLY = 1;
const NEXT = 1;
const NOT_FOUND = -1;
const NONE = 0;
const HALF = 2;

function servedPath(url: string): string {
  return (URL.parse(url) ?? BLANK).pathname.slice(NEXT);
}

function appFile(file: string): string {
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

function inlineMap(source: string): string {
  const at = source.lastIndexOf(INLINE_MAP);
  const encodedAt = source.indexOf(BASE64, at);
  if (at === NOT_FOUND || encodedAt === NOT_FOUND) {
    return "";
  }
  return source.slice(encodedAt + BASE64.length).trim();
}

function sourceMapped(source: string): Outcome<SourceMapped> {
  const encoded = inlineMap(source);
  if (encoded === "") {
    return { ok: false, reason: "no source map" };
  }
  const starts = lineStarts(source);
  const map = new TraceMap(Buffer.from(encoded, "base64").toString("utf8"));
  const segments = decodedMappings(map).flatMap((line: readonly Readonly<SourceMapSegment>[], generatedLine: number) =>
    line.flatMap((segment: Readonly<SourceMapSegment>): readonly Segment[] => {
      if (segment.length === GENERATED_ONLY) {
        return [];
      }
      const [column, sourceIndex, originalLine] = segment;
      return [{ line: originalLine + NEXT, offset: (starts[generatedLine] ?? NONE) + column, source: sourceIndex }];
    }),
  );
  return {
    ok: true,
    value: {
      segments: segments.toSorted((left, right) => left.offset - right.offset),
      sources: map.sources.map((file) => file ?? ""),
    },
  };
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

function oneSourceSpan(first: Segment, last: Segment): boolean {
  return first.source === last.source && first.line <= last.line;
}

function functionOf(
  segments: readonly Segment[],
  { count, endOffset, startOffset }: Range,
): readonly FunctionCoverage[] {
  const firstIndex = firstAtOrAfter(segments, startOffset);
  const lastIndex = firstAtOrAfter(segments, endOffset) - NEXT;
  const first = segments[firstIndex] ?? NO_SEGMENT;
  const last = segments[lastIndex] ?? NO_SEGMENT;
  if (firstIndex > lastIndex || !oneSourceSpan(first, last)) {
    return [];
  }
  return [{ called: count > NONE, source: first.source, span: [first.line, last.line] }];
}

function functionsOf(script: ScriptCoverage, segments: readonly Segment[]): readonly FunctionCoverage[] {
  const { length } = script.source ?? "";
  return script.functions
    .flatMap(({ ranges: [whole] }) => whole ?? [])
    .filter((range) => range.startOffset !== NONE || range.endOffset < length)
    .flatMap((range) => functionOf(segments, range));
}

function fileCoverage(functions: readonly FunctionCoverage[]): FileCoverage {
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

function servedModule(script: ScriptCoverage, file: string): readonly Served[] {
  const mapped = sourceMapped(script.source ?? "");
  if (!mapped.ok) {
    return [[file, mapped]];
  }
  return [[file, { ok: true, value: fileCoverage(functionsOf(script, mapped.value.segments)) }]];
}

function servedBundle(script: ScriptCoverage): readonly Served[] {
  const mapped = sourceMapped(script.source ?? "");
  if (!mapped.ok) {
    return [];
  }
  const functions = functionsOf(script, mapped.value.segments);
  return mapped.value.sources.flatMap((source, index): readonly Served[] => {
    if (appFile(source) === "") {
      return [];
    }
    const own = functions.filter((covered) => covered.source === index);
    return [[source, { ok: true, value: fileCoverage(own) }]];
  });
}

function servedFile(script: ScriptCoverage): readonly Served[] {
  const served = servedPath(script.url);
  const file = appFile(served);
  if (file !== "") {
    return servedModule(script, file);
  }
  if (BUNDLE.test(served)) {
    return servedBundle(script);
  }
  return [];
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
