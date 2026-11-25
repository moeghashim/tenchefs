import { FAILED, PASSED, commit, git, hygiene, repo, write } from "./lib/hygiene-repo.ts";
import { expect, it } from "vitest";
import type { File } from "./lib/hygiene-repo.ts";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const HOOK_RUN = "run: node scripts/hygiene.ts";
const SHIPPED = "api/sdk.api.md";
const ADR = "docs/adr/0001-first.md";
const NEW_ADR = "docs/adr/0002-second.md";
const OTHER_CHANGESET = ".changeset/brave-dogs-sing.md";
const OWN_CHANGESET = ".changeset/quiet-cats-nap.md";
const CHANGESET_MISSING = "adds no changeset since its merge base with v1";

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

it("the hook passes an ADR committed alone on a branch whose first commit added its changeset", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const dir = deployedV1();
  commit(dir, [OWN_CHANGESET, "---\n---\n"], [SHIPPED, "first\n"]);
  commit(dir, [SHIPPED, "second\n"]);
  stage(dir, [NEW_ADR, "# Second\n"]);

  expect(hook(dir)).toStrictEqual({ status: PASSED, stderr: "" });
});

it("the hook refuses an ADR committed on a branch with no changeset", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = deployedV1();
  commit(dir, [SHIPPED, "first\n"]);
  stage(dir, [NEW_ADR, "# Second\n"]);
  const run = hook(dir);

  expect(run.status).toBe(FAILED);
  expect(run.stderr).toContain(CHANGESET_MISSING);
});

it("the hook refuses shipped files staged with an ADR in a branch's first commit and no changeset", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const dir = deployedV1();
  stage(dir, [SHIPPED, "first\n"], [NEW_ADR, "# Second\n"]);
  const run = hook(dir);

  expect(run.status).toBe(FAILED);
  expect(run.stderr).toContain(CHANGESET_MISSING);
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

function unreleasedChangesetOnV1(): string {
  const dir = repo();
  commit(dir, [OTHER_CHANGESET, '---\n"@ai-hero/cookout": patch\n---\n\nA change from another ticket.\n']);
  git(dir, "tag", "deploy/first");
  git(dir, "update-ref", "refs/remotes/origin/v1", "v1");
  git(dir, "checkout", "-q", "-b", "ticket-1");
  return dir;
}

it("doesn't count a renamed changeset as adding one", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = unreleasedChangesetOnV1();
  git(dir, "mv", OTHER_CHANGESET, OWN_CHANGESET);
  commit(dir, [SHIPPED, "first\n"]);
  const run = hygiene(dir);

  expect(run.status).toBe(FAILED);
  expect(run.stderr).toContain(CHANGESET_MISSING);
});

it("the hook doesn't count a changeset renamed alongside an ADR as adding one", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = unreleasedChangesetOnV1();
  commit(dir, [SHIPPED, "first\n"]);
  git(dir, "mv", OTHER_CHANGESET, OWN_CHANGESET);
  stage(dir, [NEW_ADR, "# Second\n"]);
  const run = hook(dir);

  expect(run.status).toBe(FAILED);
  expect(run.stderr).toContain(CHANGESET_MISSING);
});
