import { expect, it } from "vitest";
import { unstableArguments, unstableLines, unstableReport } from "../lib/coverage-unstable.ts";

const ROOT = "/repo";

function fileCoverage(hits: Readonly<Record<number, number>>): unknown {
  const lines = Object.keys(hits).map(Number);
  const statementMap = Object.fromEntries(
    lines.map((line) => [String(line), { end: { column: 9, line }, start: { column: 2, line } }]),
  );
  return Object.fromEntries([
    ["s", Object.fromEntries(lines.map((line) => [String(line), hits[line]]))],
    ["statementMap", statementMap],
  ]);
}

const steady = fileCoverage({ 1: 1, 2: 0 });

const runs = [
  { "/repo/app/racy.ts": fileCoverage({ 1: 1, 2: 1, 3: 0 }), "/repo/app/steady.ts": steady },
  { "/repo/app/racy.ts": fileCoverage({ 1: 1, 2: 0, 3: 0 }), "/repo/app/steady.ts": steady },
  { "/repo/app/racy.ts": fileCoverage({ 1: 1, 2: 4, 3: 0 }), "/repo/app/steady.ts": steady },
];

it("lists each line covered in some runs but not all, with how many runs covered it", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(unstableLines({ root: ROOT, runs })).toStrictEqual([{ covered: 2, file: "app/racy.ts", line: 2, runs: 3 }]);
});

it("lists nothing when every run covers the same lines", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(
    unstableLines({ root: ROOT, runs: [{ "/repo/app/steady.ts": steady }, { "/repo/app/steady.ts": steady }] }),
  ).toStrictEqual([]);
});

it("names the test files that reach each unstable line", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const attribution = [
    { coverage: { "/repo/app/racy.ts": fileCoverage({ 1: 1, 2: 1 }) }, testFiles: ["/repo/app/tests/racy.test.ts"] },
    { coverage: { "/repo/app/racy.ts": fileCoverage({ 1: 1, 2: 0 }) }, testFiles: ["/repo/app/tests/other.test.ts"] },
  ];
  const report = unstableReport({ attribution, root: ROOT, unstable: unstableLines({ root: ROOT, runs }) });

  expect(report).toStrictEqual({
    lines: [
      "app/racy.ts:2 covered in 2 of 3 runs, reached by app/tests/racy.test.ts",
      "RESULT: FAIL (1 line covered in some runs but not all)",
    ],
    ok: false,
  });
});

it("says so when no test file reached an unstable line in the runs it kept", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const report = unstableReport({ attribution: [], root: ROOT, unstable: unstableLines({ root: ROOT, runs }) });

  const [first] = report.lines;

  expect(first).toBe("app/racy.ts:2 covered in 2 of 3 runs, reached by no test file the runs recorded");
});

it("passes when no line is unstable", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(unstableReport({ attribution: [], root: ROOT, unstable: [] })).toStrictEqual({
    lines: ["RESULT: PASS (every line was covered in every run or in none)"],
    ok: true,
  });
});

it("runs the suite 5 times unless told a count of at least 2", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect([
    unstableArguments([]),
    unstableArguments(["3"]),
    unstableArguments(["1"]),
    unstableArguments(["x"]),
  ]).toStrictEqual([{ ok: true, runs: 5 }, { ok: true, runs: 3 }, { ok: false }, { ok: false }]);
});
