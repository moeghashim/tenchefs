import type { CoverageMap } from "../../lib/browser-coverage.ts";
import type { Outcome } from "../../lib/tools.ts";
import type { Span } from "../../lib/page-coverage.ts";
import type { browserTestsFor } from "../../lib/browser-selection.ts";
import { readdirSync } from "node:fs";

type Selecting = Parameters<typeof browserTestsFor> extends readonly [infer Selection] ? Selection : never;

interface Branch {
  readonly coverage?: Outcome<CoverageMap>;
  readonly files: readonly string[];
  readonly unchanged?: boolean;
}

const ROOT = process.cwd();
const BROWSER_TESTS = "app/modules/routes/tests/browser";
const LOGIN_TEST = `${BROWSER_TESTS}/login.browser.test.ts`;
const VIEW = "app/modules/views/lib/login-form.tsx";
const LOGIN_FORM_START = 13;
const LOGIN_FORM_END = 38;
const IN_LOGIN_FORM = 20;
const LOGIN_FORM: Span = [LOGIN_FORM_START, LOGIN_FORM_END];
const NO_MAP: Outcome<CoverageMap> = { ok: false, reason: "no map in this test" };

function browserTests(): readonly string[] {
  return readdirSync(BROWSER_TESTS)
    .filter((file) => file.endsWith(".browser.test.ts"))
    .map((file) => `${BROWSER_TESTS}/${file}`)
    .toSorted();
}

function mapCalling(calling: readonly string[]): CoverageMap {
  const tests = browserTests().map(
    (test) => [test, { [VIEW]: [LOGIN_FORM].filter(() => calling.includes(test)) }] as const,
  );
  return { commit: "abc123", files: { [VIEW]: [LOGIN_FORM] }, tests: Object.fromEntries(tests) };
}

function onBranch({ coverage = NO_MAP, files, unchanged = true }: Branch): Selecting {
  return {
    changed: { ok: true, value: files },
    coverage: () => coverage,
    cwd: ROOT,
    history: {
      changedLines: () => ({ ok: true, value: [[IN_LOGIN_FORM, IN_LOGIN_FORM]] }),
      unchangedSince: () => unchanged,
    },
  };
}

export { BROWSER_TESTS, LOGIN_TEST, ROOT, VIEW, browserTests, mapCalling, onBranch };
