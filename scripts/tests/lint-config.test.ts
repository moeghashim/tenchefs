import { BRANCH, git, repo, repos } from "./lib/merge-repos.ts";
import { LOOSENINGS, TIGHTENINGS, withRules } from "./lib/lint-config-cases.ts";
import { expect, it } from "vitest";
import { lintConfigCheck } from "../lib/lint-config-guard.ts";

const APPROVED = "the ticket\n\nLint-approved-by: board msg 4367";
const ON_THE_BRANCH = { base: "", head: "HEAD" } as const;
const OFF = withRules({ "no-console": "off" });

function landOnV1(work: string): string {
  const before = git(work, "rev-parse", "origin/v1");
  git(work, "checkout", "-q", "v1");
  git(work, "merge", "-q", "--no-ff", "--no-edit", BRANCH);
  git(work, "push", "-q", "origin", "v1");
  return before;
}

it.each(LOOSENINGS)("refuses a branch with $name, naming the file and the hunk", { timeout: 10_000 }, (change) => {
  expect.hasAssertions();

  const { work } = repos();
  repo(work).commit("the ticket", change.files);

  const verdict = lintConfigCheck({ ...ON_THE_BRANCH, cwd: work });

  expect(verdict.ok).toBe(false);
  expect(verdict.report).toContain(`${change.file}: ${change.what}, in the hunk:\n@@ -`);
  expect(verdict.report).toContain(change.hunk);
  expect(verdict.report).toContain(
    "Only Matt approves a loosening: the commit that makes it carries the trailer Lint-approved-by: board msg <id>, naming his message.",
  );
});

it.each(LOOSENINGS)("passes a branch with $name when its commit carries the trailer", { timeout: 10_000 }, (change) => {
  expect.hasAssertions();

  const { work } = repos();
  repo(work).commit(APPROVED, change.files);

  expect(lintConfigCheck({ ...ON_THE_BRANCH, cwd: work })).toStrictEqual({ ok: true, report: "" });
});

it.each(TIGHTENINGS)("passes a branch with $name and no trailer", { timeout: 10_000 }, ({ files }) => {
  expect.hasAssertions();

  const { work } = repos();
  repo(work).commit("the ticket", files);

  expect(lintConfigCheck({ ...ON_THE_BRANCH, cwd: work })).toStrictEqual({ ok: true, report: "" });
});

it("refuses a loosening whose trailer sits on a commit that doesn't make it", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { work } = repos();
  repo(work).commit("the ticket", OFF);
  repo(work).commit(APPROVED, { "notes.txt": "elsewhere\n" });

  expect(lintConfigCheck({ ...ON_THE_BRANCH, cwd: work }).ok).toBe(false);
});

it("refuses a trailer that names no board message", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { work } = repos();
  repo(work).commit("the ticket\n\nLint-approved-by: me", OFF);

  expect(lintConfigCheck({ ...ON_THE_BRANCH, cwd: work }).ok).toBe(false);
});

it("refuses a pushed range on v1 with an untrailered loosening", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { work } = repos();
  repo(work).commit("the ticket", OFF);
  const before = landOnV1(work);

  const verdict = lintConfigCheck({ base: before, cwd: work, head: "HEAD" });

  expect(verdict.ok).toBe(false);
  expect(verdict.report).toContain(`lint-config: ${before}..HEAD loosens the lint config`);
  expect(verdict.report).toContain(".oxlintrc.json: rule no-console is turned off (error to off), in the hunk:\n@@ -");
});

it("passes a pushed range on v1 whose loosening's commit carries the trailer", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { work } = repos();
  repo(work).commit(APPROVED, OFF);
  const before = landOnV1(work);

  expect(lintConfigCheck({ base: before, cwd: work, head: "HEAD" })).toStrictEqual({ ok: true, report: "" });
});

it("passes a pushed range that doesn't touch a loosening an earlier push made", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { work } = repos();
  repo(work).commit("the ticket", OFF);
  landOnV1(work);
  const before = git(work, "rev-parse", "HEAD");
  repo(work).commit("later", { "notes.txt": "later\n" });

  expect(lintConfigCheck({ base: before, cwd: work, head: "HEAD" })).toStrictEqual({ ok: true, report: "" });
});

it("fails when the range's base isn't a commit here", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { work } = repos();

  expect(lintConfigCheck({ base: "0000000", cwd: work, head: "HEAD" })).toStrictEqual({
    ok: false,
    report: "lint-config: 0000000 is not a commit here (a shallow checkout?). Fetch it.",
  });
});

it("fails when the branch shares no history with origin/v1", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { work } = repos();
  git(work, "checkout", "-q", "--orphan", "orphan");
  repo(work).commit("unrelated", { "notes.txt": "orphan\n" });

  expect(lintConfigCheck({ ...ON_THE_BRANCH, cwd: work }).report).toContain(
    "lint-config: Could not find HEAD's merge base with origin/v1.",
  );
});
