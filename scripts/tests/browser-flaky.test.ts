import { expect, it } from "vitest";
import { flakyArguments, flakyReport } from "../lib/browser-flaky.ts";

const passed = { status: "passed" };
const failed = { status: "failed" };
const timedOut = { status: "timedOut" };
const skipped = { status: "skipped" };

const report = {
  suites: [
    {
      file: "post.browser.test.ts",
      specs: [
        { tests: [{ results: [passed] }], title: "posts" },
        { tests: [{ results: [failed] }], title: "posts" },
        { tests: [{ results: [passed] }], title: "posts" },
      ],
      suites: [
        {
          specs: [
            { tests: [{ results: [timedOut] }], title: "waits" },
            { tests: [{ results: [passed] }], title: "waits" },
            { tests: [{ results: [skipped] }], title: "waits" },
          ],
          title: "the composer",
        },
      ],
    },
  ],
};

const steady = {
  suites: [{ file: "a.browser.test.ts", specs: [{ tests: [{ results: [passed, passed] }], title: "a" }] }],
};

it("prints each test's pass and fail counts across its repeats, then a verdict naming the flaky ones", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  expect(flakyReport(report)).toStrictEqual({
    lines: [
      "  2 passed  1 failed  post.browser.test.ts › posts",
      "  1 passed  1 failed  post.browser.test.ts › the composer › waits",
      "RESULT: FAIL (2 of 2 tests failed at least once)",
    ],
    ok: false,
  });
  expect(flakyReport(steady)).toStrictEqual({
    lines: ["  2 passed  0 failed  a.browser.test.ts › a", "RESULT: PASS (1 test never failed)"],
    ok: true,
  });
});

it("fails when the run reported no tests, so a mistyped file never reads as steady", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(flakyReport({ suites: [] })).toStrictEqual({ lines: ["RESULT: FAIL (no tests ran)"], ok: false });
  expect(flakyReport(null)).toStrictEqual({ lines: ["RESULT: FAIL (no tests ran)"], ok: false });
});

it("takes a file, a repeat count, 25 by default, and an optional -g title, and refuses anything else", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  expect([
    flakyArguments(["post.browser.test.ts"]),
    flakyArguments(["post.browser.test.ts", "4"]),
    flakyArguments(["post.browser.test.ts", "4", "-g", "posts"]),
    flakyArguments(["post.browser.test.ts", "-g", "posts"]),
    flakyArguments([]),
    flakyArguments(["post.browser.test.ts", "0"]),
    flakyArguments(["post.browser.test.ts", "many"]),
    flakyArguments(["post.browser.test.ts", "-g"]),
  ]).toStrictEqual([
    { file: "post.browser.test.ts", grep: [], ok: true, repeats: 25 },
    { file: "post.browser.test.ts", grep: [], ok: true, repeats: 4 },
    { file: "post.browser.test.ts", grep: ["-g", "posts"], ok: true, repeats: 4 },
    { file: "post.browser.test.ts", grep: ["-g", "posts"], ok: true, repeats: 25 },
    { ok: false },
    { ok: false },
    { ok: false },
    { ok: false },
  ]);
});
