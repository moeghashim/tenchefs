import { browserSkip, browserTestsFor } from "../lib/browser-selection.ts";
import { expect, it, onTestFinished } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import type { CoverageMap } from "../lib/browser-coverage.ts";
import type { Outcome } from "../lib/tools.ts";
import type { Span } from "../lib/page-coverage.ts";
import { changedFiles } from "../lib/changed-files.ts";
import path from "node:path";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const BROWSER_TESTS = "app/modules/routes/tests/browser";
const COMPOSER_TEST = `${BROWSER_TESTS}/composer.browser.test.ts`;
const LOGIN_TEST = `${BROWSER_TESTS}/login.browser.test.ts`;
const VIEW = "app/modules/views/lib/login-form.tsx";
const SERVER = "app/modules/http/index.ts";
const LOGIN_FORM_START = 13;
const LOGIN_FORM_END = 38;
const IN_LOGIN_FORM = 20;
const LOGIN_FORM: Span = [LOGIN_FORM_START, LOGIN_FORM_END];
type Selecting = Parameters<typeof browserTestsFor> extends readonly [infer Selection] ? Selection : never;

const NO_MAP: Outcome<CoverageMap> = { ok: false, reason: "no map in this test" };

interface Branch {
  readonly coverage?: Outcome<CoverageMap>;
  readonly unchanged?: boolean;
}

function browserTests(): readonly string[] {
  return readdirSync(BROWSER_TESTS)
    .filter((file) => file.endsWith(".browser.test.ts"))
    .map((file) => `${BROWSER_TESTS}/${file}`);
}

function mapCalling(calling: readonly string[]): CoverageMap {
  const tests = browserTests().map(
    (test) => [test, { [VIEW]: [LOGIN_FORM].filter(() => calling.includes(test)) }] as const,
  );
  return { commit: "abc123", files: { [VIEW]: [LOGIN_FORM] }, tests: Object.fromEntries(tests) };
}

function onBranch(files: readonly string[], { coverage = NO_MAP, unchanged = true }: Branch = {}): Selecting {
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

function importersOf(helper: string): readonly string[] {
  return readdirSync(BROWSER_TESTS)
    .filter((file) => file.endsWith(".browser.test.ts"))
    .map((file) => `${BROWSER_TESTS}/${file}`)
    .filter((file) => readFileSync(file, "utf8").includes(`"./${helper}"`))
    .toSorted();
}

function emptyDirectory(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "browser-selection-"));
  onTestFinished(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  return dir;
}

it("a branch changing one browser test runs that test alone", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selection = browserTestsFor(onBranch([COMPOSER_TEST]));

  expect(selection).toMatchObject({ all: false, run: [COMPOSER_TEST] });
});

it("a branch changing a helper runs only the browser tests that import it", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selection = browserTestsFor(onBranch([`${BROWSER_TESTS}/relay.ts`]));

  expect(selection).toMatchObject({ all: false, run: importersOf("relay.ts") });
});

it("a branch changing a view runs only the browser tests whose recorded coverage ran the changed function", {
  timeout: 30_000,
}, () => {
  expect.hasAssertions();

  const selection = browserTestsFor(onBranch([VIEW], { coverage: { ok: true, value: mapCalling([LOGIN_TEST]) } }));

  expect(selection).toMatchObject({ all: false, run: [LOGIN_TEST] });
});

it("runs a browser test the coverage map doesn't hold when the branch changes a view", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const { [COMPOSER_TEST]: _composer, ...tests } = mapCalling([LOGIN_TEST]).tests;
  const map = { ...mapCalling([LOGIN_TEST]), tests };

  const selection = browserTestsFor(onBranch([VIEW], { coverage: { ok: true, value: map } }));

  expect(selection).toMatchObject({ all: false, run: [COMPOSER_TEST, LOGIN_TEST] });
});

it("a branch changing a view runs every browser test when there's no coverage map", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selection = browserTestsFor(onBranch([VIEW], { coverage: { ok: false, reason: "gh isn't logged in" } }));

  expect(selection).toStrictEqual({ all: true, reason: "there's no browser coverage map: gh isn't logged in" });
});

it("a branch changing a view runs every browser test when the view changed since the map was recorded", {
  timeout: 30_000,
}, () => {
  expect.hasAssertions();

  const selection = browserTestsFor(
    onBranch([VIEW], { coverage: { ok: true, value: mapCalling([LOGIN_TEST]) }, unchanged: false }),
  );

  expect(selection).toStrictEqual({
    all: true,
    reason: `${VIEW} changed since the coverage map's commit abc123`,
  });
});

it("a branch changing a view the coverage map doesn't hold runs every browser test", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const map = { ...mapCalling([LOGIN_TEST]), files: {} };

  const selection = browserTestsFor(onBranch([VIEW], { coverage: { ok: true, value: map } }));

  expect(selection).toStrictEqual({ all: true, reason: `the coverage map doesn't hold ${VIEW}` });
});

it("a branch changing the server every browser test drives runs them all", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selection = browserTestsFor(onBranch([SERVER], { coverage: { ok: true, value: mapCalling([LOGIN_TEST]) } }));

  expect(selection).toStrictEqual({
    all: true,
    reason: `${SERVER} is part of the cookout server every browser test drives`,
  });
});

it("a branch changing only scripts and docs no browser test reaches runs none", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selection = browserTestsFor(
    onBranch(["scripts/hygiene.ts", "docs/verification.md", ".changeset/quiet-otters-sing.md"]),
  );

  expect(selection).toMatchObject({ all: false, run: [] });
});

it("a changed file outside the module graph runs every browser test", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selection = browserTestsFor(onBranch(["scripts/hygiene.ts", "index.html"]));

  expect(selection).toStrictEqual({ all: true, reason: "the module graph doesn't hold index.html" });
});

it("runs every browser test when the module graph can't be built", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selection = browserTestsFor({ ...onBranch([COMPOSER_TEST]), cwd: emptyDirectory() });

  expect(selection).toMatchObject({ all: true });
});

it("runs every browser test when the branch's changed files can't be listed", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selection = browserTestsFor({ ...onBranch([]), changed: changedFiles({ base: "no-such-ref", cwd: ROOT }) });

  expect(selection).toMatchObject({ all: true });
});

it("selects from the files the branch changed against its base", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selection = browserTestsFor({ ...onBranch([]), changed: changedFiles({ base: "HEAD", cwd: ROOT }) });

  expect(selection).toHaveProperty("all");
});

it("names the browser tests it skipped, and that CI runs them all", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const skipped = browserSkip({
    all: false,
    run: [COMPOSER_TEST],
    skipped: [`${BROWSER_TESTS}/approve.browser.test.ts`, `${BROWSER_TESTS}/home.browser.test.ts`],
  });

  expect(skipped).toStrictEqual([
    {
      ciJob: "browser",
      command: "pnpm browser",
      name: "the browser tests this branch doesn't reach (2 of 3 files: approve, home)",
    },
  ]);
});

it("names no browser skip when every browser test runs", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const skips = [
    browserSkip({ all: true, reason: "" }),
    browserSkip({ all: false, run: [COMPOSER_TEST], skipped: [] }),
  ];

  expect(skips).toStrictEqual([[], []]);
});
