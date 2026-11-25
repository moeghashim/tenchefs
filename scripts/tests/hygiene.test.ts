import { FAILED, PASSED, commit, git, hygiene, repo } from "./lib/hygiene-repo.ts";
import { expect, it } from "vitest";

const MIGRATIONS = "app/modules/storage/lib/server/migrations.ts";
const POSTGRES_MIGRATIONS = "app/modules/storage/lib/server/postgres-migrations.ts";

function migrations(entries: readonly string[]): string {
  return `const migrations = [\n${entries.map((entry) => `  \`CREATE TABLE ${entry} (id TEXT) STRICT;\`,\n`).join("")}];\n`;
}

function postgresMigrations(entries: readonly string[]): string {
  const listed = entries.map((entry) => `  [\n    \`CREATE TABLE ${entry} (id text)\`,\n  ],\n`).join("");
  return `const postgresMigrations: readonly (readonly string[])[] = [\n${listed}];\n`;
}

function deployedTwice(): { readonly dir: string; readonly first: string } {
  const dir = repo();
  commit(dir, [MIGRATIONS, migrations(["a"])]);
  git(dir, "tag", "deploy/first");
  const first = git(dir, "rev-parse", "HEAD");
  commit(dir, [MIGRATIONS, migrations(["a", "b"])]);
  git(dir, "tag", "deploy/second");
  git(dir, "update-ref", "refs/remotes/origin/v1", "v1");
  return { dir, first };
}

it("passes a branch cut before the newest deploy that changed no migrations", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { dir, first } = deployedTwice();
  git(dir, "checkout", "-q", "-b", "ticket-1", first);
  commit(dir, ["ticket.txt", "work\n"]);

  expect(hygiene(dir)).toStrictEqual({ status: PASSED, stderr: "" });
});

it("refuses a branch that contains no deploy tag", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = repo();
  commit(dir, [MIGRATIONS, migrations(["a"])]);
  git(dir, "update-ref", "refs/remotes/origin/v1", "v1");
  commit(dir, ["ticket.txt", "work\n"]);
  const run = hygiene(dir);

  expect(run.status).toBe(FAILED);
  expect(run.stderr).toContain("hygiene: found no deploy/* tag that HEAD contains");
});

it("refuses a migration inserted mid-list on a branch that contains the newest deploy", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { dir } = deployedTwice();
  commit(dir, [MIGRATIONS, migrations(["a", "c", "b"])]);
  const run = hygiene(dir);

  expect(run.status).toBe(FAILED);
  expect(run.stderr).toContain(
    `hygiene: ${MIGRATIONS}: the migrations list must begin with deploy/second's, entry for entry, but index 1 (schema version 2) differs`,
  );
});

function postgresDeployed(): string {
  const { dir } = deployedTwice();
  commit(dir, [POSTGRES_MIGRATIONS, postgresMigrations(["a", "b"])]);
  git(dir, "tag", "deploy/third");
  return dir;
}

it("refuses a Postgres migration edited after the newest deploy", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = postgresDeployed();
  commit(dir, [POSTGRES_MIGRATIONS, postgresMigrations(["a", "edited"])]);
  const run = hygiene(dir);

  expect(run.status).toBe(FAILED);
  expect(run.stderr).toContain(
    `hygiene: ${POSTGRES_MIGRATIONS}: the migrations list must begin with deploy/third's, entry for entry, but index 1 (schema version 2) differs`,
  );
});

it("refuses Postgres migrations reordered after the newest deploy", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = postgresDeployed();
  commit(dir, [POSTGRES_MIGRATIONS, postgresMigrations(["b", "a"])]);
  const run = hygiene(dir);

  expect(run.status).toBe(FAILED);
  expect(run.stderr).toContain(`hygiene: ${POSTGRES_MIGRATIONS}: the migrations list must begin with deploy/third's`);
});

it("passes a Postgres migration appended after the newest deploy", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = postgresDeployed();
  commit(dir, [POSTGRES_MIGRATIONS, postgresMigrations(["a", "b", "c"])]);

  expect(hygiene(dir)).toStrictEqual({ status: PASSED, stderr: "" });
});

it("passes a Postgres list added after a deploy that had none", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { dir } = deployedTwice();
  commit(dir, [POSTGRES_MIGRATIONS, postgresMigrations(["a"])]);

  expect(hygiene(dir)).toStrictEqual({ status: PASSED, stderr: "" });
});
