interface FailingTest {
  readonly error: readonly string[];
  readonly name: string;
}

interface Runner {
  readonly errorEnds: (line: string) => boolean;
  readonly heading: (line: string) => string;
  readonly region: (lines: readonly string[]) => readonly string[];
}

const ERROR_LINES = 5;
const FIRST = 0;
const NEXT = 1;
const NOT_FOUND = -1;

const ESCAPE_CODE = 27;
const ESCAPE = String.fromCodePoint(ESCAPE_CODE);
const ANSI = new RegExp(`(?:${ESCAPE}|\\^\\[)\\[[\\d;]*m`, "gu");
const JOB_PREFIX = /^[^\t]*\t[^\t]*\t/u;
const TIMESTAMP = /^﻿?\d{4}-\d\d-\d\dT[\d:.]+Z ?/u;

const VITEST_FAILED = /^⎯+ Failed (?:Tests|Suites) \d+ ⎯/u;
const VITEST_SUMMARY = /^Test Files\b/u;
const VITEST_TEST = /^FAIL\s+(?<name>\S.*)$/u;
const VITEST_ERROR_END = /^(?:❯|⎯|\d+\|)/u;
const PLAYWRIGHT_TEST = /^\d+\) (?<name>\[[^\]]+\] › .+)$/u;
const PLAYWRIGHT_ERROR_END = /^(?:Call log:|>?\s*\d+ \||at |Retry #\d|\d+ (?:failed|flaky|passed)\b|─)/u;

function cleaned(log: string): readonly string[] {
  return log
    .replaceAll(ANSI, "")
    .split("\n")
    .map((line) => line.replace(JOB_PREFIX, "").replace(TIMESTAMP, "").trim());
}

function vitestRegion(lines: readonly string[]): readonly string[] {
  const kept: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (VITEST_FAILED.test(line)) {
      inside = true;
    } else if (VITEST_SUMMARY.test(line)) {
      inside = false;
    } else if (inside) {
      kept.push(line);
    }
  }
  return kept;
}

function named(pattern: Readonly<RegExp>): (line: string) => string {
  return (line) => {
    if (!pattern.test(line)) {
      return "";
    }
    return line.replace(pattern, "$<name>").replaceAll(/\s+/gu, " ");
  };
}

const runners: readonly Runner[] = [
  { errorEnds: (line) => VITEST_ERROR_END.test(line), heading: named(VITEST_TEST), region: vitestRegion },
  { errorEnds: (line) => PLAYWRIGHT_ERROR_END.test(line), heading: named(PLAYWRIGHT_TEST), region: (lines) => lines },
];

function nonBlank(lines: readonly string[]): readonly string[] {
  return lines.filter((line) => line !== "").slice(FIRST, ERROR_LINES);
}

function errorAfter(lines: readonly string[], runner: Runner): readonly string[] {
  const end = lines.findIndex((line) => runner.errorEnds(line) || runner.heading(line) !== "");
  if (end === NOT_FOUND) {
    return nonBlank(lines);
  }
  return nonBlank(lines.slice(FIRST, end));
}

function errorBelow(rest: readonly string[], runner: Runner): readonly string[] {
  const after = rest.findIndex((line) => runner.heading(line) === "");
  if (after === NOT_FOUND) {
    return [];
  }
  return errorAfter(rest.slice(after), runner);
}

function testsOf(lines: readonly string[], runner: Runner): readonly FailingTest[] {
  const found = new Map<string, FailingTest>();
  for (const [index, line] of lines.entries()) {
    const name = runner.heading(line);
    if (name !== "" && !found.has(name)) {
      found.set(name, { error: errorBelow(lines.slice(index + NEXT), runner), name });
    }
  }
  return [...found.values()];
}

function failingTests(log: string): readonly FailingTest[] {
  const lines = cleaned(log);
  return runners.flatMap((runner) => testsOf(runner.region(lines), runner));
}

function failingTestsBlock(log: string): string {
  const tests = failingTests(log);
  if (tests.length === FIRST) {
    return "";
  }
  const described = tests.map((test) => `\n  FAIL ${test.name}${test.error.map((line) => `\n    ${line}`).join("")}`);
  return `\nFailing tests:${described.join("")}`;
}

export { failingTests, failingTestsBlock };
