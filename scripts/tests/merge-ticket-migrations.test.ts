import { TICKET, git, migrations, redCi, repo, repos } from "./lib/merge-repos.ts";
import { expect, it } from "vitest";
import type { Merged } from "../lib/merge-ticket.ts";

function refusal(merged: Merged): { readonly files: readonly string[]; readonly reason: string } {
  if (merged.ok) {
    return { files: [], reason: "merged" };
  }
  return { files: merged.files, reason: merged.reason };
}

it("refuses a merge that inserts a migration before one v1 already has, naming the index", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { origin, work } = repos();
  const before = git(origin, "rev-parse", "v1");
  repo(work).commit("the ticket", { "migrations.ts": migrations("c", "a") });

  const { files, reason } = refusal(repo(work).merge({}));

  expect(files).toStrictEqual(["migrations.ts"]);
  expect(reason).toContain(
    "migrations.ts: the migrations list must begin with origin/v1's, entry for entry, but index 0 (schema version 1) differs",
  );
  expect(reason).toContain(`Nothing was pushed. The merge is on merge-ticket-${TICKET}`);
  expect(git(origin, "rev-parse", "v1")).toBe(before);
});

it("puts v1's new migrations before the ticket's when v1 moved before --continue", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  repo(work).commit("the ticket", { "migrations.ts": migrations("a", "c") });
  repo(work).merge({ ci: redCi });
  repo(other).push({ "migrations.ts": migrations("a", "b") });

  const merged = repo(work).continueMerge({});

  expect(merged).toStrictEqual({ ok: true, sha: git(origin, "rev-parse", "v1") });
  expect(git(origin, "show", "v1:migrations.ts")).toBe(migrations("a", "b", "c").trim());
});

it("lets a ticket move a migration that isn't deployed when the base is the deployed commit", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  git(work, "tag", "deploy/base", "v1");
  repo(other).push({ "migrations.ts": migrations("a", "b", "c") });
  git(work, "fetch", "-q", "origin");
  git(work, "merge", "-q", "--ff-only", "origin/v1");
  repo(work).commit("the ticket", { "migrations.ts": migrations("a", "c", "b") });

  const merged = repo(work).merge({ migrationsBase: "deploy/base" });

  expect(merged).toStrictEqual({ ok: true, sha: git(origin, "rev-parse", "v1") });
  expect(git(origin, "show", "v1:migrations.ts")).toBe(migrations("a", "c", "b").trim());
});
