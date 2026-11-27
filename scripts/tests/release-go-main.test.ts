import { expect, it } from "vitest";
import { DateTime } from "effect";
import type { Outcome } from "../lib/tools.ts";
import { releaseGo } from "../lib/release-go.ts";

const SHA = "aaaa1111bbbb2222";
const TAG = "deploy/cccc3333";
const NOW_MS = DateTime.toEpochMillis(DateTime.makeUnsafe("2026-11-25T12:00:00Z"));
const MINUTE_MS = 60_000;
const THIS_RUN = "900";
const BEHIND = "0";
const AHEAD = "1";
const CI_ONLY = [
  "AGENTS.md",
  "docs/verification.md",
  ".changeset/small.md",
  "app/modules/cli/tests/server/cli.test.ts",
  "app/modules/web/tests/browser/thread.browser.test.ts",
  "app/modules/routes/tests/sidebar-keys.ts",
  "scripts/release-commit.ts",
  ".github/workflows/release.yml",
];

interface History {
  readonly changed: readonly string[];
  readonly main: Outcome<string>;
  readonly runs: readonly object[];
}

const HISTORY: History = { changed: CI_ONLY, main: { ok: true, value: AHEAD }, runs: [] };
const A_MINUTE_AGO = DateTime.formatIso(DateTime.makeUnsafe(NOW_MS - MINUTE_MS));

function gitOf({ changed, main }: History): (args: readonly string[]) => Outcome<string> {
  const answers = new Map<string, Outcome<string>>([
    ["diff", { ok: true, value: `${changed.join("\n")}\n` }],
    ["for-each-ref", { ok: true, value: `${TAG}\n` }],
    [`origin/main..${SHA}`, main],
    [`${TAG}..${SHA}`, { ok: true, value: `${AHEAD}\n` }],
  ]);
  return (args) => {
    const [answer] = args.flatMap((arg) => answers.get(arg) ?? []);
    return answer ?? { ok: false, reason: `unexpected git ${args.join(" ")}` };
  };
}

function ghOf({ runs }: History): (args: readonly string[]) => Outcome<string> {
  return (args) => {
    if (args.includes("list")) {
      return { ok: true, value: JSON.stringify(runs) };
    }
    return { ok: true, value: JSON.stringify({ jobs: [{ conclusion: "success", name: "browser 1/6" }] }) };
  };
}

function decided(overrides: Partial<History>): ReturnType<typeof releaseGo> {
  const history = { ...HISTORY, ...overrides };
  return releaseGo({
    asked: { event: "workflow_run", nowMillis: NOW_MS, sha: SHA, thisRun: THIS_RUN },
    gh: ghOf(history),
    git: gitOf(history),
  });
}

it("moves main, with no gate and no deploy, for a range with only docs, tests, scripts/ or .github/ changes", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  expect(decided({})).toStrictEqual({
    ok: true,
    value: {
      go: false,
      line: `moves main: nothing user-facing since ${TAG}, so main takes ${SHA}'s workflows without the gate or a deploy`,
      promote: true,
    },
  });
});

it("moves main for a range with only CI changes even just after a gate run", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(decided({ runs: [{ databaseId: 5, startedAt: A_MINUTE_AGO }] })).toMatchObject({
    ok: true,
    value: { go: false, promote: true },
  });
});

it("moves nothing for a range with only CI changes when main already has the commit", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(decided({ main: { ok: true, value: BEHIND } })).toStrictEqual({
    ok: true,
    value: {
      go: false,
      line: `skipped: nothing user-facing since ${TAG}, and main already has ${SHA}`,
      promote: false,
    },
  });
});

it("finds nothing user-facing in a range touching only a test helper under a tests/ folder", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(decided({ changed: ["app/modules/routes/tests/sidebar-keys.ts"] })).toStrictEqual({
    ok: true,
    value: {
      go: false,
      line: `moves main: nothing user-facing since ${TAG}, so main takes ${SHA}'s workflows without the gate or a deploy`,
      promote: true,
    },
  });
});

it("finds nothing user-facing in a range touching only the shared test utilities under app/modules/testing", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  expect(decided({ changed: ["app/modules/testing/lib/calls-in-flight.ts"] })).toMatchObject({
    ok: true,
    value: { go: false, promote: true },
  });
});

it("runs the gate, so Release can publish, for a Version Packages merge that only bumps the version", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  expect(decided({ changed: [".changeset/small-wasps-act.md", "CHANGELOG.md", "package.json"] })).toMatchObject({
    ok: true,
    value: { go: true, promote: true },
  });
});

it.each([["app/modules/routes/index.ts"], ["package.json"]])(
  "still runs the gate when %s, outside any tests/ folder, changed",
  { timeout: 1000 },
  (file) => {
    expect.hasAssertions();

    expect(decided({ changed: ["app/modules/routes/tests/sidebar-keys.ts", file] })).toMatchObject({
      ok: true,
      value: { go: true, promote: true },
    });
  },
);

it("still runs the gate for a range with a user-facing change", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(decided({ changed: [...CI_ONLY, "app/main.ts"] })).toMatchObject({
    ok: true,
    value: { go: true, promote: true },
  });
});

it("fails, naming the command, when git can't tell whether main has the commit", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const failed: Outcome<string> = { ok: false, reason: "git rev-list origin/main failed" };

  expect(decided({ main: failed })).toStrictEqual(failed);
});
