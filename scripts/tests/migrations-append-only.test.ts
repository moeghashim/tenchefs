import { expect, it } from "vitest";
import { migrationsInserted } from "../lib/migrations-append-only.ts";

const FILE = "app/modules/storage/lib/server/migrations.ts";

function source(...entries: readonly string[]): string {
  return [
    'import { Effect } from "effect";',
    "",
    "const migrations: readonly string[] = [",
    ...entries.map((entry) => `  ${entry},`),
    "];",
    "",
    "const after = [1, 2];",
  ].join("\n");
}

const tables = "`CREATE TABLE a (\n     b TEXT, c TEXT\n   ) STRICT;`";
const rename = '"ALTER TABLE a RENAME COLUMN b TO d;"';
const presence = "`ALTER TABLE presence ADD COLUMN offline_reason TEXT;`";
const closing = "`ALTER TABLE messages ADD COLUMN closed_at TEXT;`";

it("passes a list that only appends to the base's", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const base = source(tables, rename, "REACTIONS_MIGRATION");
  const head = source(tables, rename, "REACTIONS_MIGRATION", presence, closing);

  expect(migrationsInserted({ base, baseName: "origin/v1", file: FILE, head })).toStrictEqual([]);
});

it("names the first differing index when a migration is inserted mid-list", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const base = source(tables, rename, presence);
  const head = source(tables, rename, closing, presence);

  expect(migrationsInserted({ base, baseName: "origin/v1", file: FILE, head })).toStrictEqual([
    `${FILE}: the migrations list must begin with origin/v1's, entry for entry, but index 2 (schema version 3) differs: origin/v1 has ${presence}, and this has ${closing}. Migrations apply by position, so a deployed database would skip this one. Move new migrations to the end of the list.`,
  ]);
});

it("refuses a list that drops a migration the base has", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const base = source(tables, rename);
  const head = source(tables);

  expect(migrationsInserted({ base, baseName: "origin/main", file: FILE, head })).toStrictEqual([
    `${FILE}: the migrations list must begin with origin/main's, entry for entry, but index 1 (schema version 2) differs: origin/main has ${rename}, and this has nothing. Migrations apply by position, so a deployed database would skip this one. Move new migrations to the end of the list.`,
  ]);
});

it("says so when it can't find the migrations list", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(migrationsInserted({ base: source(tables), baseName: "origin/v1", file: FILE, head: "" })).toStrictEqual([
    `${FILE}: found no \`const migrations = [...]\` list to compare with origin/v1's.`,
  ]);
});

it("keeps commas and brackets inside quoted SQL within one entry", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const quoted = String.raw`'it\'s, [odd]'`;
  const escaped = String.raw`"a \"quoted\", entry"`;
  const base = source(quoted, escaped);
  const head = source(quoted, "`(a, b)`", escaped);

  expect(migrationsInserted({ base, baseName: "origin/v1", file: FILE, head })).toStrictEqual([
    `${FILE}: the migrations list must begin with origin/v1's, entry for entry, but index 1 (schema version 2) differs: origin/v1 has ${escaped}, and this has \`(a, b)\`. Migrations apply by position, so a deployed database would skip this one. Move new migrations to the end of the list.`,
  ]);
});

const POSTGRES_FILE = "app/modules/storage/lib/server/postgres-migrations.ts";
const first = ["`CREATE TABLE a (b text)`", `"INSERT INTO a (b) VALUES ('x')"`];
const second = ["`CREATE TABLE c (d text)`"];
const edited = ["`CREATE TABLE a (b text, e text)`", `"INSERT INTO a (b) VALUES ('x')"`];

function postgresSource(...migrations: readonly (readonly string[])[]): string {
  const listed = migrations.map((statements) => `  [\n${statements.map((sql) => `    ${sql},\n`).join("")}  ],`);
  return ["const postgresMigrations: readonly (readonly string[])[] = [", ...listed, "];"].join("\n");
}

it("passes a Postgres list that appends a migration of several statements", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const base = postgresSource(first);
  const head = postgresSource(first, second);

  expect(migrationsInserted({ base, baseName: "origin/v1", file: POSTGRES_FILE, head })).toStrictEqual([]);
});

it("refuses a Postgres list that edits a statement inside a shipped migration", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const base = postgresSource(first, second);
  const head = postgresSource(edited, second);

  expect(migrationsInserted({ base, baseName: "origin/v1", file: POSTGRES_FILE, head })).toStrictEqual([
    expect.stringContaining(
      `${POSTGRES_FILE}: the migrations list must begin with origin/v1's, entry for entry, but index 0 (schema version 1) differs`,
    ),
  ]);
});
