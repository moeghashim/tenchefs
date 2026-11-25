import { field, list, text } from "./json.ts";
import { grepped } from "./playwright-grep.ts";

interface Tally {
  readonly failed: number;
  readonly passed: number;
  readonly title: string;
}

interface FlakyReport {
  readonly lines: readonly string[];
  readonly ok: boolean;
}

type FlakyArguments =
  | { readonly file: string; readonly grep: readonly string[]; readonly ok: true; readonly repeats: number }
  | { readonly ok: false };

const DEFAULT_REPEATS = 25;
const NONE = 0;
const ONE = 1;
const COUNT_WIDTH = 3;
const FAILING = new Set(["failed", "timedOut", "interrupted"]);

function statusesOf(spec: unknown): readonly string[] {
  return (list(field(spec, "tests")) ?? [])
    .flatMap((test) => list(field(test, "results")) ?? [])
    .map((result) => text(field(result, "status")) ?? "");
}

function suiteResults(suite: unknown, titles: readonly string[]): readonly (readonly [string, string])[] {
  const own = (list(field(suite, "specs")) ?? []).flatMap((spec) => {
    const title = [...titles, text(field(spec, "title")) ?? ""].join(" › ");
    return statusesOf(spec).map((status) => [title, status] as const);
  });
  const inner = (list(field(suite, "suites")) ?? []).flatMap((child) =>
    suiteResults(child, [...titles, text(field(child, "title")) ?? ""]),
  );
  return [...own, ...inner];
}

function counted(tally: Tally, status: string): Tally {
  if (status === "passed") {
    return { ...tally, passed: tally.passed + ONE };
  }
  if (FAILING.has(status)) {
    return { ...tally, failed: tally.failed + ONE };
  }
  return tally;
}

function talliesOf(report: unknown): readonly Tally[] {
  const tallies = new Map<string, Tally>();
  const results = (list(field(report, "suites")) ?? []).flatMap((suite) =>
    suiteResults(suite, [text(field(suite, "file")) ?? ""]),
  );
  for (const [title, status] of results) {
    tallies.set(title, counted(tallies.get(title) ?? { failed: NONE, passed: NONE, title }, status));
  }
  return [...tallies.values()];
}

function tallyLine(tally: Tally): string {
  const passed = String(tally.passed).padStart(COUNT_WIDTH);
  return `${passed} passed  ${String(tally.failed)} failed  ${tally.title}`;
}

function testsWord(count: number): string {
  if (count === ONE) {
    return "1 test";
  }
  return `${String(count)} tests`;
}

function flakyReport(report: unknown): FlakyReport {
  const tallies = talliesOf(report);
  if (tallies.length === NONE) {
    return { lines: ["RESULT: FAIL (no tests ran)"], ok: false };
  }
  const flaky = tallies.filter((tally) => tally.failed > NONE).length;
  const lines = tallies.map((tally) => tallyLine(tally));
  if (flaky === NONE) {
    return { lines: [...lines, `RESULT: PASS (${testsWord(tallies.length)} never failed)`], ok: true };
  }
  const verdict = `RESULT: FAIL (${String(flaky)} of ${testsWord(tallies.length)} failed at least once)`;
  return { lines: [...lines, verdict], ok: false };
}

function repeatsFrom(count: string | undefined): number {
  const repeats = Number(count ?? String(DEFAULT_REPEATS));
  if (Number.isInteger(repeats) && repeats > NONE) {
    return repeats;
  }
  return NONE;
}

function flakyArguments(args: readonly string[]): FlakyArguments {
  const filtered = grepped(args);
  if (filtered === null) {
    return { ok: false };
  }
  const [file = "", count] = filtered.rest;
  const repeats = repeatsFrom(count);
  if (file === "" || repeats === NONE) {
    return { ok: false };
  }
  return { file, grep: filtered.grep, ok: true, repeats };
}

export { flakyArguments, flakyReport };
