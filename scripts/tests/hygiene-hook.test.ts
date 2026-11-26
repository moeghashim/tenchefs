import { FAILED, PASSED, commit, git, hygiene, repo, write } from "./lib/hygiene-repo.ts";
import { expect, it } from "vitest";
import type { File } from "./lib/hygiene-repo.ts";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const HOOK_RUN = "run: node scripts/hygiene.ts";
const SHIPPED = "api/sdk.api.md";
const ADR = "docs/adr/0001-first.md";
const NEW_ADR = "docs/adr/0002-second.md";

function hookArgs(): readonly string[] {
  const run =
    readFileSync("lefthook.yml", "utf8")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith(HOOK_RUN)) ?? "";
  return run
    .slice(HOOK_RUN.length)
    .split(" ")
    .filter((arg) => arg !== "");
}

function hook(dir: string): ReturnType<typeof hygiene> {
  return hygiene(dir, ...hookArgs());
}

function stage(dir: string, ...files: readonly File[]): void {
  write(dir, ...files);
  git(dir, "add", "-A");
}

function deployedV1(): string {
  const dir = repo();
  commit(dir, [ADR, "# First\n\nThe decision.\n"]);
  git(dir, "tag", "deploy/first");
  git(dir, "update-ref", "refs/remotes/origin/v1", "v1");
  git(dir, "checkout", "-q", "-b", "ticket-1");
  return dir;
}

it("passes a branch that changes a shipped file and adds no changeset", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = deployedV1();
  commit(dir, [SHIPPED, "first\n"]);

  expect(hygiene(dir)).toStrictEqual({ status: PASSED, stderr: "" });
});

it("the hook passes shipped files staged with an ADR and no changeset", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = deployedV1();
  stage(dir, [SHIPPED, "first\n"], [NEW_ADR, "# Second\n"]);

  expect(hook(dir)).toStrictEqual({ status: PASSED, stderr: "" });
});

function mergedV1WithNewAdr(): string {
  const dir = deployedV1();
  commit(dir, ["ticket.txt", "work\n"]);
  git(dir, "checkout", "-q", "v1");
  commit(dir, [NEW_ADR, "# Second\n\nThe decision.\n"]);
  git(dir, "update-ref", "refs/remotes/origin/v1", "v1");
  git(dir, "checkout", "-q", "ticket-1");
  git(dir, "merge", "-q", "--no-edit", "v1");
  return dir;
}

it("the hook refuses an ADR from v1 edited in place after the branch merged v1", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = mergedV1WithNewAdr();
  stage(dir, [NEW_ADR, "# Second\n\nA different decision.\n"]);
  const run = hook(dir);

  expect(run.status).toBe(FAILED);
  expect(run.stderr).toContain(`${NEW_ADR} is append-only, but this change removes the line "The decision."`);
});

const CLASHING_ADR = "docs/adr/0002-mine.md";

function v1TookTheNumber(): string {
  const dir = deployedV1();
  commit(dir, [CLASHING_ADR, "# Mine\n\nMy decision.\n"]);
  git(dir, "checkout", "-q", "v1");
  commit(dir, [NEW_ADR, "# Second\n\nThe decision.\n"]);
  git(dir, "update-ref", "refs/remotes/origin/v1", "v1");
  git(dir, "checkout", "-q", "ticket-1");
  return dir;
}

it("refuses a branch whose new ADR takes a number origin/v1 has since used", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const run = hygiene(v1TookTheNumber());

  expect(run).toStrictEqual({
    status: FAILED,
    stderr: `hygiene: ${CLASHING_ADR} takes ADR number 0002, which origin/v1 already gives ${NEW_ADR}. Renumber it to 0003, past origin/v1's highest, and fix every link to it.\n`,
  });
});

it("the hook refuses a staged ADR whose number origin/v1 has since used", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = v1TookTheNumber();
  stage(dir, ["docs/adr/0002-more.md", "# More\n"]);
  const run = hook(dir);

  expect(run.status).toBe(FAILED);
  expect(run.stderr).toContain(`hygiene: docs/adr/0002-more.md takes ADR number 0002`);
});

it("passes v1 itself, whose newest commit added an ADR origin/v1 holds", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = deployedV1();
  git(dir, "checkout", "-q", "v1");
  commit(dir, [NEW_ADR, "# Second\n\nThe decision.\n"]);
  git(dir, "update-ref", "refs/remotes/origin/v1", "v1");

  expect(hygiene(dir)).toStrictEqual({ status: PASSED, stderr: "" });
});

function mergingV1WithNewAdr(): string {
  const dir = deployedV1();
  commit(dir, ["ticket.txt", "work\n"]);
  git(dir, "checkout", "-q", "v1");
  commit(dir, [NEW_ADR, "# Second\n\nThe decision.\n"], ["ticket.txt", "other work\n"]);
  git(dir, "update-ref", "refs/remotes/origin/v1", "v1");
  git(dir, "checkout", "-q", "ticket-1");
  spawnSync("git", ["merge", "-q", "--no-edit", "v1"], { cwd: dir });
  return dir;
}

it("the hook refuses an ADR from v1 edited in place while resolving a merge of v1", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = mergingV1WithNewAdr();
  stage(dir, ["ticket.txt", "both\n"], [NEW_ADR, "# Second\n\nA different decision.\n"]);
  const run = hook(dir);

  expect(run.status).toBe(FAILED);
  expect(run.stderr).toContain(`${NEW_ADR} is append-only`);
});

const TABLE_ADR = "docs/adr/0003-a-table.md";
const UNPADDED = [
  "# A table",
  "",
  "| trace | time |",
  "| --- | --- |",
  "| off | 86 s |",
  "| `retain-on-failure` | 122 s |",
  "",
];
const PADDED = [
  "# A table",
  "",
  "| trace               | time  |",
  "| ------------------- | ----- |",
  "| off                 | 86 s  |",
  "| `retain-on-failure` | 122 s |",
  "",
];

function v1WithTable(): string {
  const dir = deployedV1();
  git(dir, "checkout", "-q", "v1");
  commit(dir, [TABLE_ADR, UNPADDED.join("\n")]);
  git(dir, "update-ref", "refs/remotes/origin/v1", "v1");
  git(dir, "checkout", "-q", "-B", "ticket-1");
  return dir;
}

it("the hook passes an ADR from v1 that Biome only reformats", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = v1WithTable();
  stage(dir, [TABLE_ADR, PADDED.join("\n")]);

  expect(hook(dir)).toStrictEqual({ status: PASSED, stderr: "" });
});

it("the hook refuses a reformat of an ADR from v1 that also changes a word", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = v1WithTable();
  stage(dir, [TABLE_ADR, PADDED.join("\n").replace("86 s ", "96 s ")]);
  const run = hook(dir);

  expect(run.status).toBe(FAILED);
  expect(run.stderr).toContain(`${TABLE_ADR} is append-only, but this change removes the line "| off | 86 s |"`);
});

it("the hook formats a staged ADR before it judges it", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(readFileSync("lefthook.yml", "utf8")).toMatch(
    /- name: format\n\s+glob: "\*\.\{[^}]*,md\}"\n\s+run: scripts\/quiet\.sh node_modules\/\.bin\/biome format --write /u,
  );
});
