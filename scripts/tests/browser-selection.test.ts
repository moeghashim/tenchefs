import { BROWSER_TESTS, LOGIN_TEST, ROOT, VIEW, mapCalling, onBranch } from "./lib/branch-selecting.ts";
import { browserSkip, browserTestsFor } from "../lib/browser-selection.ts";
import { expect, it, onTestFinished } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { changedFiles } from "../lib/changed-files.ts";
import path from "node:path";
import { tmpdir } from "node:os";

const COMPOSER_TEST = `${BROWSER_TESTS}/composer.browser.test.ts`;
const SERVER = "app/modules/http/index.ts";

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

  const selection = browserTestsFor(onBranch({ files: [COMPOSER_TEST] }));

  expect(selection).toMatchObject({ all: false, run: [COMPOSER_TEST] });
});

it("a branch changing a helper runs only the browser tests that import it", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selection = browserTestsFor(onBranch({ files: [`${BROWSER_TESTS}/relay.ts`] }));

  expect(selection).toMatchObject({ all: false, run: importersOf("relay.ts") });
});

it("a branch changing a view runs only the browser tests whose recorded coverage ran the changed function", {
  timeout: 30_000,
}, () => {
  expect.hasAssertions();

  const selection = browserTestsFor(
    onBranch({ coverage: { ok: true, value: mapCalling([LOGIN_TEST]) }, files: [VIEW] }),
  );

  expect(selection).toMatchObject({ all: false, run: [LOGIN_TEST] });
});

it("runs a browser test the coverage map doesn't hold when the branch changes a view", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const { [COMPOSER_TEST]: _composer, ...tests } = mapCalling([LOGIN_TEST]).tests;
  const map = { ...mapCalling([LOGIN_TEST]), tests };

  const selection = browserTestsFor(onBranch({ coverage: { ok: true, value: map }, files: [VIEW] }));

  expect(selection).toMatchObject({ all: false, run: [COMPOSER_TEST, LOGIN_TEST] });
});

it("a branch changing a view runs every browser test when there's no coverage map", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selection = browserTestsFor(onBranch({ coverage: { ok: false, reason: "gh isn't logged in" }, files: [VIEW] }));

  expect(selection).toStrictEqual({ all: true, reason: "there's no browser coverage map: gh isn't logged in" });
});

it("a branch changing a view runs every browser test when the view changed since the map was recorded", {
  timeout: 30_000,
}, () => {
  expect.hasAssertions();

  const selection = browserTestsFor(
    onBranch({ coverage: { ok: true, value: mapCalling([LOGIN_TEST]) }, files: [VIEW], unchanged: false }),
  );

  expect(selection).toStrictEqual({
    all: true,
    reason: `${VIEW} changed since the coverage map's commit abc123`,
  });
});

it("a branch changing a view the coverage map doesn't hold runs every browser test", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const map = { ...mapCalling([LOGIN_TEST]), files: {} };

  const selection = browserTestsFor(onBranch({ coverage: { ok: true, value: map }, files: [VIEW] }));

  expect(selection).toStrictEqual({ all: true, reason: `the coverage map doesn't hold ${VIEW}` });
});

it("a branch changing the server every browser test drives runs them all", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selection = browserTestsFor(
    onBranch({ coverage: { ok: true, value: mapCalling([LOGIN_TEST]) }, files: [SERVER] }),
  );

  expect(selection).toStrictEqual({
    all: true,
    reason: `${SERVER} is part of the cookout server every browser test drives`,
  });
});

it("a branch changing only scripts and docs no browser test reaches runs none", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selection = browserTestsFor(
    onBranch({ files: ["scripts/hygiene.ts", "docs/verification.md", ".changeset/quiet-otters-sing.md"] }),
  );

  expect(selection).toMatchObject({ all: false, run: [] });
});

it("a changed file outside the module graph runs every browser test", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selection = browserTestsFor(onBranch({ files: ["scripts/hygiene.ts", "index.html"] }));

  expect(selection).toStrictEqual({ all: true, reason: "the module graph doesn't hold index.html" });
});

it("runs every browser test when the module graph can't be built", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selection = browserTestsFor({ ...onBranch({ files: [COMPOSER_TEST] }), cwd: emptyDirectory() });

  expect(selection).toMatchObject({ all: true });
});

it("runs every browser test when the branch's changed files can't be listed", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selection = browserTestsFor({
    ...onBranch({ files: [] }),
    changed: changedFiles({ base: "no-such-ref", cwd: ROOT }),
  });

  expect(selection).toMatchObject({ all: true });
});

it("selects from the files the branch changed against its base", { timeout: 30_000 }, () => {
  expect.hasAssertions();

  const selection = browserTestsFor({ ...onBranch({ files: [] }), changed: changedFiles({ base: "HEAD", cwd: ROOT }) });

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
      workflow: "Release",
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
