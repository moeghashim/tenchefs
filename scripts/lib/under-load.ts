import { field, list, text } from "./json.ts";
import path from "node:path";

interface FailedTest {
  readonly file: string;
  readonly name: string;
  readonly reason: string;
}

interface Report {
  readonly base: string;
  readonly report: unknown;
}

const NONE = 0;
const REASON_LINES = 4;
const ESCAPE_CODE = 27;
const ESCAPE = String.fromCodePoint(ESCAPE_CODE);
const ANSI = new RegExp(`${ESCAPE}\\[[0-9;]*m`, "gu");
const PASSING = new Set(["passed", "skipped", "pending", "todo", "expected", "flaky"]);

function reasonOf(message: string): string {
  return message
    .replaceAll(ANSI, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > NONE && !line.startsWith("at "))
    .slice(NONE, REASON_LINES)
    .join(" | ");
}

function firstText(values: readonly unknown[]): string {
  return values.map((value) => text(value) ?? "").find((value) => value.length > NONE) ?? "";
}

function vitestTestFailures(assertion: unknown, file: string): readonly FailedTest[] {
  if (PASSING.has(text(field(assertion, "status")) ?? "")) {
    return [];
  }
  const messages = list(field(assertion, "failureMessages")) ?? [];
  return [{ file, name: text(field(assertion, "fullName")) ?? "", reason: reasonOf(firstText(messages)) }];
}

function outsideAnyTest(result: unknown, file: string): FailedTest {
  return { file, name: "(the file failed outside any test)", reason: reasonOf(text(field(result, "message")) ?? "") };
}

function vitestFileFailures(result: unknown, root: string): readonly FailedTest[] {
  const file = path.relative(root, text(field(result, "name")) ?? "");
  const failed = (list(field(result, "assertionResults")) ?? []).flatMap((assertion) =>
    vitestTestFailures(assertion, file),
  );
  if (failed.length === NONE && text(field(result, "status")) === "failed") {
    return [outsideAnyTest(result, file)];
  }
  return failed;
}

function vitestFailures({ base, report }: Report): readonly FailedTest[] {
  return (list(field(report, "testResults")) ?? []).flatMap((result) => vitestFileFailures(result, base));
}

interface Walk {
  readonly base: string;
  readonly prefix: readonly string[];
}

function playwrightSpecFailures(spec: unknown, { base, prefix }: Walk): readonly FailedTest[] {
  const file = path.join(base, text(field(spec, "file")) ?? "");
  const name = [...prefix, text(field(spec, "title")) ?? ""].join(" > ");
  const failed = (list(field(spec, "tests")) ?? []).filter((test) => !PASSING.has(text(field(test, "status")) ?? ""));
  if (failed.length === NONE) {
    return [];
  }
  const results = failed.flatMap((test) => list(field(test, "results")) ?? []);
  const reason = reasonOf(firstText(results.map((result) => field(field(result, "error"), "message"))));
  return [{ file, name, reason }];
}

function playwrightSuiteFailures(suite: unknown, { base, prefix }: Walk): readonly FailedTest[] {
  const title = text(field(suite, "title")) ?? "";
  let inner: Walk = { base, prefix: [...prefix, title] };
  if (text(field(suite, "file")) === title) {
    inner = { base, prefix };
  }
  const specs = (list(field(suite, "specs")) ?? []).flatMap((spec) => playwrightSpecFailures(spec, inner));
  const suites = (list(field(suite, "suites")) ?? []).flatMap((child) => playwrightSuiteFailures(child, inner));
  return [...specs, ...suites];
}

function playwrightFailures({ base, report }: Report): readonly FailedTest[] {
  return (list(field(report, "suites")) ?? []).flatMap((suite) => playwrightSuiteFailures(suite, { base, prefix: [] }));
}

function numberAt(value: unknown, key: string): number {
  const found = field(value, key);
  if (typeof found === "number") {
    return found;
  }
  return NONE;
}

function vitestCount(report: unknown): number {
  return numberAt(report, "numTotalTests");
}

function playwrightCount(report: unknown): number {
  const stats = field(report, "stats");
  return ["expected", "unexpected", "flaky", "skipped"].reduce((sum, key) => sum + numberAt(stats, key), NONE);
}

function keyOf(test: FailedTest): string {
  return `${test.file} > ${test.name}`;
}

interface Runs {
  readonly alone: readonly FailedTest[];
  readonly underLoad: readonly FailedTest[];
}

function failingOnlyUnderLoad({ alone, underLoad }: Runs): readonly FailedTest[] {
  const failedAlone = new Set(alone.map((test) => keyOf(test)));
  const unique = new Map(underLoad.map((test) => [keyOf(test), test]));
  return [...unique.values()].filter((test) => !failedAlone.has(keyOf(test)));
}

function filesOf(tests: readonly FailedTest[]): readonly string[] {
  return [...new Set(tests.map((test) => test.file))].toSorted();
}

function failureList(tests: readonly FailedTest[]): string {
  return tests.map((test) => `  ${keyOf(test)}\n    ${test.reason}`).join("\n");
}

type Suite = "all" | "none" | readonly string[];

interface Loading {
  readonly files: readonly string[];
  readonly webOnly: boolean;
}

interface LoadedSuites {
  readonly browser: Suite;
  readonly web: Suite;
}

function named(files: readonly string[]): Suite {
  if (files.length === NONE) {
    return "none";
  }
  return files;
}

function browserSuite({ files, webOnly }: Loading): Suite {
  if (webOnly) {
    return "none";
  }
  if (files.length === NONE) {
    return "all";
  }
  return named(files.filter((file) => file.endsWith(".browser.test.ts")));
}

function webSuite(files: readonly string[]): Suite {
  if (files.length === NONE) {
    return "all";
  }
  return named(files.filter((file) => file.endsWith(".tsx")));
}

function loadedSuites(loading: Loading): LoadedSuites {
  return { browser: browserSuite(loading), web: webSuite(loading.files) };
}

export type { FailedTest, LoadedSuites };
export {
  failingOnlyUnderLoad,
  failureList,
  filesOf,
  loadedSuites,
  playwrightCount,
  playwrightFailures,
  vitestCount,
  vitestFailures,
};
