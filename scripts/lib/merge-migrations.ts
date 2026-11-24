import { DONE, git, stop } from "./merge-steps.ts";
import { readFileSync, writeFileSync } from "node:fs";
import type { FirstSide } from "./conflicts.ts";
import type { Step } from "./merge-steps.ts";
import { migrationsInserted } from "./migrations-append-only.ts";
import path from "node:path";
import { resolveHunks } from "./conflicts.ts";
import { spawnSync } from "node:child_process";

interface MigrationOptions {
  readonly cwd: string;
  readonly migrationsBase: string;
  readonly rules: { readonly appendOnly: readonly string[] };
  readonly ticket: number;
}

interface Refusal {
  readonly file: string;
  readonly reasons: readonly string[];
}

interface Remerging {
  readonly cwd: string;
  readonly files: readonly string[];
  readonly first: FirstSide;
}

interface Sides {
  readonly base: string;
  readonly ours: string;
  readonly theirs: string;
}

const NONE = 0;
const MAX_BUFFER = 268_435_456;
const CONFLICT_START = "<<<<<<< ours";

function insertedMigrations(options: MigrationOptions, file: string): readonly string[] {
  const base = git(options, "show", `${options.migrationsBase}:${file}`);
  if (!base.ok) {
    return [];
  }
  const head = readFileSync(path.join(options.cwd, file), "utf8");
  return migrationsInserted({ base: base.output, baseName: options.migrationsBase, file, head });
}

function appendOnlyMigrations(options: MigrationOptions): Step {
  const refused = options.rules.appendOnly.map(
    (file): Refusal => ({ file, reasons: insertedMigrations(options, file) }),
  );
  const inserted = refused.filter((refusal: Readonly<Refusal>) => refusal.reasons.length > NONE);
  if (inserted.length === NONE) {
    return DONE;
  }
  const reasons = inserted.flatMap((refusal: Readonly<Refusal>) => refusal.reasons).join("\n");
  return stop(
    `${reasons}\nNothing was pushed. The merge is on merge-ticket-${options.ticket}: move the new migrations to the end of the list and commit, then run pnpm merge-ticket ${options.ticket} --continue.`,
    ...inserted.map((refusal: Readonly<Refusal>) => refusal.file),
  );
}

function blob(options: Remerging, revision: string, file: string): string {
  return git(options, "rev-parse", "-q", "--verify", `${revision}:${file}`).output;
}

function changedOnBoth({ base, ours, theirs }: Sides): boolean {
  return ours !== base && theirs !== base && ours !== theirs && ![base, ours, theirs].includes("");
}

function sidesOf(options: Remerging, file: string): readonly Sides[] {
  const mergeBase = git(options, "merge-base", "HEAD", "MERGE_HEAD");
  const sides = {
    base: blob(options, mergeBase.output, file),
    ours: blob(options, "HEAD", file),
    theirs: blob(options, "MERGE_HEAD", file),
  };
  if (!mergeBase.ok || !changedOnBoth(sides)) {
    return [];
  }
  return [sides];
}

function mergedText(options: Remerging, { base, ours, theirs }: Sides): string {
  const labels = ["-L", "ours", "-L", "base", "-L", "theirs"];
  return spawnSync("git", ["merge-file", "-p", "--diff3", ...labels, "--object-id", ours, base, theirs], {
    cwd: options.cwd,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  }).stdout;
}

function staged(options: Remerging, file: string, text: string): boolean {
  writeFileSync(path.join(options.cwd, file), text);
  return git(options, "add", "--", file).ok;
}

function resolvedFrom(options: Remerging, file: string, sides: Sides): boolean {
  const source = mergedText(options, sides);
  const resolved = resolveHunks({ first: options.first, resolve: "append", source });
  if (resolved.ok) {
    return staged(options, file, resolved.text);
  }
  if (source.includes(CONFLICT_START)) {
    writeFileSync(path.join(options.cwd, file), source);
    return false;
  }
  return staged(options, file, source);
}

function remergeMigrations(options: Remerging): readonly string[] {
  return options.files.filter((file) => sidesOf(options, file).some((sides) => !resolvedFrom(options, file, sides)));
}

export { appendOnlyMigrations, remergeMigrations };
