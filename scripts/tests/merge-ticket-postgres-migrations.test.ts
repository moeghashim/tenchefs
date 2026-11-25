import { TICKET, git, repo, repos } from "./lib/merge-repos.ts";
import { expect, it } from "vitest";
import type { Merged } from "../lib/merge-ticket.ts";
import { mergeRules } from "../lib/merge-rules.ts";

const POSTGRES_MIGRATIONS = "app/modules/storage/lib/server/postgres-migrations.ts";

function postgresMigrations(...entries: readonly string[]): string {
  const listed = entries
    .map(
      (entry) =>
        `  [\n    \`CREATE TABLE ${entry} (\n       id text\n     )\`,\n    "INSERT INTO ${entry} VALUES ('x')",\n  ],\n`,
    )
    .join("");
  return `const postgresMigrations: readonly (readonly string[])[] = [\n${listed}];\n`;
}

function refusal(merged: Merged): { readonly files: readonly string[]; readonly reason: string } {
  if (merged.ok) {
    return { files: [], reason: "merged" };
  }
  return { files: merged.files, reason: merged.reason };
}

function onV1(...entries: readonly string[]): ReturnType<typeof repos> {
  const cloned = repos();
  repo(cloned.other).push({ [POSTGRES_MIGRATIONS]: postgresMigrations(...entries) });
  git(cloned.work, "fetch", "-q", "origin");
  git(cloned.work, "merge", "-q", "--ff-only", "origin/v1");
  return cloned;
}

it("refuses a ticket that edits a Postgres migration v1 already has", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { origin, work } = onV1("a", "b");
  const before = git(origin, "rev-parse", "v1");
  repo(work).commit("the ticket", { [POSTGRES_MIGRATIONS]: postgresMigrations("a", "edited") });

  const { files, reason } = refusal(repo(work).merge({ rules: mergeRules }));

  expect(files).toStrictEqual([POSTGRES_MIGRATIONS]);
  expect(reason).toContain(
    `${POSTGRES_MIGRATIONS}: the migrations list must begin with origin/v1's, entry for entry, but index 1 (schema version 2) differs`,
  );
  expect(reason).toContain(`Nothing was pushed. The merge is on merge-ticket-${TICKET}`);
  expect(git(origin, "rev-parse", "v1")).toBe(before);
});

it("appends both sides when v1 and the ticket each add a Postgres migration", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { origin, other, work } = onV1("a");
  repo(work).commit("the ticket", { [POSTGRES_MIGRATIONS]: postgresMigrations("a", "b") });
  repo(other).push({ [POSTGRES_MIGRATIONS]: postgresMigrations("a", "c") });

  const merged = repo(work).merge({ rules: mergeRules });

  expect(merged).toStrictEqual({ ok: true, sha: git(origin, "rev-parse", "v1") });
  expect(git(origin, "show", `v1:${POSTGRES_MIGRATIONS}`)).toBe(postgresMigrations("a", "c", "b").trim());
});
