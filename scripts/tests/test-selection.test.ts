import { LOGIN_TEST, VIEW, browserTests, mapCalling, onBranch } from "./lib/branch-selecting.ts";
import { expect, it } from "vitest";
import { unitSkip, unitTestsFor } from "../lib/test-selection.ts";
import { browserTestsFor } from "../lib/browser-selection.ts";

const MODULE = "scripts/lib/merge-lint.ts";

function selection(files: readonly string[]): readonly unknown[] {
  return [
    unitTestsFor({ ok: true, value: files }),
    browserTestsFor(onBranch({ coverage: { ok: true, value: mapCalling([LOGIN_TEST]) }, files })),
  ];
}

it("a docs-only change runs no unit or browser tests", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selected = selection(["AGENTS.md", "docs/adr/0001-record.md", ".changeset/quiet-otters-sing.md"]);

  expect(selected).toStrictEqual([
    { all: false, related: [] },
    { all: false, run: [], skipped: browserTests() },
  ]);
});

it("a change to one module runs only the unit tests related to it and no browser test", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selected = selection([MODULE, "docs/verification.md"]);

  expect(selected).toMatchObject([
    { all: false, related: [MODULE] },
    { all: false, run: [] },
  ]);
});

it("a change to one view runs its related unit tests and the browser tests the coverage map reaches", {
  timeout: 30_000,
}, () => {
  expect.hasAssertions();

  const selected = selection([VIEW]);

  expect(selected).toMatchObject([
    { all: false, related: [VIEW] },
    { all: false, run: [LOGIN_TEST] },
  ]);
});

it.each([
  ["the lockfile", "pnpm-lock.yaml"],
  ["a root config", "vitest.config.ts"],
  ["the testing module", "app/modules/testing/index.ts"],
  ["a test server under scripts/", "scripts/browser-test-server.ts"],
])("a change to %s runs every unit and browser test and names the file", { timeout: 30_000 }, (_what, file) => {
  expect.hasAssertions();

  const selected = selection([MODULE, file]);

  expect(selected).toStrictEqual([
    { all: true, reason: `${file} reaches every test` },
    { all: true, reason: `${file} reaches every test` },
  ]);
});

it("runs every unit test when the branch's changed files can't be listed", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const selected = unitTestsFor({ ok: false, reason: "git diff failed" });

  expect(selected).toStrictEqual({ all: true, reason: "git diff failed" });
});

it("names the unit tests it skipped, and that CI runs them all", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const skips = [unitSkip({ all: false, related: [MODULE] }), unitSkip({ all: true, reason: "" })];

  expect(skips).toStrictEqual([
    [{ ciJob: "tests", command: "pnpm test", name: "the unit tests whose imports reach no changed file" }],
    [],
  ]);
});
