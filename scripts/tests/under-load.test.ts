import { expect, it } from "vitest";
import {
  failingOnlyUnderLoad,
  failureList,
  filesOf,
  loadedSuites,
  playwrightCount,
  playwrightFailures,
  vitestCount,
  vitestFailures,
} from "../lib/under-load.ts";

const ROOT = "/repo";
const VITEST_TESTS = 7;
const PLAYWRIGHT_TESTS = 9;
const NONE = 0;

const vitestReport = {
  testResults: [
    {
      assertionResults: [
        { fullName: "a thread opens", status: "passed" },
        {
          failureMessages: ["", "\u001B[31mAssertionError: expected 1\u001B[39m\n\n  at thread.test.tsx:4"],
          fullName: "a reply shows",
          status: "failed",
        },
      ],
      name: `${ROOT}/app/thread.test.tsx`,
      status: "failed",
    },
    { assertionResults: [], message: "Cannot find module", name: `${ROOT}/app/broken.test.tsx`, status: "failed" },
    { assertionResults: [{ fullName: "skipped", status: "skipped" }], name: `${ROOT}/app/ok.test.tsx` },
  ],
};

const playwrightReport = {
  suites: [
    {
      file: "menu.browser.test.ts",
      specs: [
        {
          file: "menu.browser.test.ts",
          tests: [{ results: [{ error: { message: "Timed out waiting for dialog" } }], status: "unexpected" }],
          title: "the menu opens",
        },
        { file: "menu.browser.test.ts", tests: [{ status: "expected" }], title: "the menu closes" },
      ],
      suites: [
        {
          file: "menu.browser.test.ts",
          specs: [{ file: "menu.browser.test.ts", tests: [{ status: "flaky" }], title: "retried" }],
          suites: [],
          title: "copy",
        },
      ],
      title: "menu.browser.test.ts",
    },
  ],
};

it("a Vitest report's failed tests are listed by file with their message but not its stack, and a file that failed outside a test is listed too", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();
  expect(vitestFailures({ base: ROOT, report: vitestReport })).toStrictEqual([
    { file: "app/thread.test.tsx", name: "a reply shows", reason: "AssertionError: expected 1" },
    { file: "app/broken.test.tsx", name: "(the file failed outside any test)", reason: "Cannot find module" },
  ]);
});

it("a Playwright report's failed tests are listed under the test directory, with their describe titles", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();
  expect(playwrightFailures({ base: "browser", report: playwrightReport })).toStrictEqual([
    { file: "browser/menu.browser.test.ts", name: "the menu opens", reason: "Timed out waiting for dialog" },
  ]);
});

it("a missing report lists no failures", { timeout: 10_000 }, () => {
  expect.hasAssertions();
  expect([
    ...vitestFailures({ base: ROOT, report: null }),
    ...playwrightFailures({ base: ROOT, report: {} }),
  ]).toStrictEqual([]);
});

it("a test that also failed alone is not a load failure, and one failing in two places is listed once", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const thread = { file: "a.test.tsx", name: "opens", reason: "late" };
  const menu = { file: "b.test.tsx", name: "closes", reason: "late" };
  const onlyUnderLoad = failingOnlyUnderLoad({ alone: [{ ...thread }], underLoad: [thread, menu, menu] });

  expect(onlyUnderLoad).toStrictEqual([menu]);
  expect(filesOf([menu, thread, menu])).toStrictEqual(["a.test.tsx", "b.test.tsx"]);
  expect(failureList([thread])).toBe("  a.test.tsx > opens\n    late");
});

it("a report's test count is every test it ran or skipped, and nothing for a report that isn't one", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();
  expect([
    vitestCount({ numTotalTests: VITEST_TESTS }),
    playwrightCount({ stats: { expected: 5, flaky: 1, skipped: 2, unexpected: 1 } }),
    vitestCount(null),
    playwrightCount({}),
  ]).toStrictEqual([VITEST_TESTS, PLAYWRIGHT_TESTS, NONE, NONE]);
});

it("under load runs both whole suites by default, only the web one with --web-only, and only the given files when named", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const web = "app/modules/routes/tests/inbox.test.tsx";
  const browser = "app/modules/routes/tests/browser/post.browser.test.ts";
  const files = [web, browser];

  expect([
    loadedSuites({ files: [], webOnly: false }),
    loadedSuites({ files: [], webOnly: true }),
    loadedSuites({ files, webOnly: false }),
    loadedSuites({ files, webOnly: true }),
    loadedSuites({ files: [web], webOnly: false }),
  ]).toStrictEqual([
    { browser: "all", web: "all" },
    { browser: "none", web: "all" },
    { browser: [browser], web: [web] },
    { browser: "none", web: [web] },
    { browser: "none", web: [web] },
  ]);
});
