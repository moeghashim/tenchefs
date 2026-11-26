import { checkPlan, reasonLines } from "../lib/check-plan.ts";
import { expect, it } from "vitest";

const SCRIPT = 3;
const ONE = 1;
const EVERYTHING = { all: true, reason: "" } as const;
const EVERY_CHECK = [
  "lint",
  "canaries",
  "types",
  "fixers",
  "seams",
  "tests",
  "browser",
  "knip",
  "validators",
  "hygiene",
  "docs",
  "api",
  "exports",
  "render",
  "lint-config",
  "format",
];
const HOOK_SKIP = {
  ciJob: "static",
  command: "pnpm check --all",
  hook: true,
  name: "lint, format, types and seams",
};

const ALL = {
  base: "",
  browser: EVERYTHING,
  inCi: false,
  local: false,
  merge: false,
  reached: false,
  shard: "",
  shardArgs: [],
  unit: EVERYTHING,
};
const LOCAL = {
  ...ALL,
  browser: { all: false, run: ["app/modules/routes/tests/browser/login.browser.test.ts"], skipped: [] },
  local: true,
  unit: { all: false, related: ["scripts/lib/merge-lint.ts"] },
} as const;

it("a local run runs none of lint, format, types or seams, and names them as the pre-commit hook's", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  const plan = checkPlan(LOCAL);

  expect([plan.checks.map((check) => check.name), plan.skipped.filter((skip) => skip.hook === true)]).toStrictEqual([
    EVERY_CHECK.filter((name) => !["lint", "format", "types", "seams"].includes(name)),
    [HOOK_SKIP],
  ]);
});

it("a local run runs only the related unit tests, without the coverage thresholds", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const plan = checkPlan(LOCAL);

  expect(plan.checks.filter((check) => check.name === "tests").map((check) => check.command)).toStrictEqual([
    [
      "pnpm",
      "run",
      "--silent",
      "test:related",
      "--reporter=default",
      "--reporter=json",
      "--outputFile.json=.timings/tests.json",
      "scripts/lib/merge-lint.ts",
    ],
  ]);
});

it("a local run reaching no tests runs neither the tests nor the browser check, and names both as skipped", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  const plan = checkPlan({
    ...LOCAL,
    browser: { all: false, run: [], skipped: ["app/modules/routes/tests/browser/login.browser.test.ts"] },
    unit: { all: false, related: [] },
  });

  expect([
    plan.checks.some((check) => ["browser", "tests"].includes(check.job)),
    plan.skipped.map((skip) => skip.ciJob),
  ]).toStrictEqual([false, ["e2e-docker", "static", "tests", "browser"]]);
});

it("--all runs every check and every test, and skips only the e2e suite", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const plan = checkPlan(ALL);

  expect([
    plan.checks.map((check) => check.name),
    plan.checks.filter((check) => check.name === "tests").map((check) => check.command.slice(SCRIPT, SCRIPT + ONE)),
    plan.skipped.map((skip) => skip.ciJob),
  ]).toStrictEqual([EVERY_CHECK, [["test"]], ["e2e-docker"]]);
});

it("says in one line which file made it run every unit and browser test", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const reason = "pnpm-lock.yaml reaches every test";
  const lines = [
    reasonLines({ browser: { all: true, reason }, unit: { all: true, reason } }),
    reasonLines({ browser: { all: true, reason: "there's no browser coverage map" }, unit: LOCAL.unit }),
    reasonLines({ browser: LOCAL.browser, unit: LOCAL.unit }),
  ];

  expect(lines).toStrictEqual([
    ["check: running every unit and browser test, since pnpm-lock.yaml reaches every test."],
    ["check: running every browser test, since there's no browser coverage map."],
    [],
  ]);
});

function browserCommand(reached: boolean): readonly (readonly string[])[] {
  const login = "app/modules/routes/tests/browser/login.browser.test.ts";
  const browser = { all: false, run: [login], skipped: [] } as const;
  return checkPlan({ ...ALL, browser, inCi: true, reached, shard: "1/6", shardArgs: [login] })
    .checks.filter((check) => check.job === "browser")
    .map((check) => check.command);
}

it("a pull request's browser shard runs Playwright on the reached files it was given, recording no coverage map", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  const login = "app/modules/routes/tests/browser/login.browser.test.ts";

  expect([browserCommand(true), browserCommand(false)]).toStrictEqual([
    [["pnpm", "run", "--silent", "browser", login]],
    [["pnpm", "run", "--silent", "browser:coverage", login]],
  ]);
});
