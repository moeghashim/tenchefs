import type { MergeOptions, MergeRules, Merged } from "../../lib/merge-ticket.ts";
import { continueMerge, mergeTicket } from "../../lib/merge-ticket.ts";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { DONE } from "../../lib/merge-steps.ts";
import type { Step } from "../../lib/merge-steps.ts";
import { execFileSync } from "node:child_process";
import { onTestFinished } from "vitest";
import path from "node:path";
import { tmpdir } from "node:os";

interface Repos {
  readonly origin: string;
  readonly other: string;
  readonly root: string;
  readonly work: string;
}

interface Overrides {
  readonly check?: readonly string[];
  readonly ci?: (branch: string, sha: string, rerunRed: boolean) => Step;
  readonly install?: readonly string[];
  readonly migrationsBase?: string;
  readonly rules?: MergeRules;
}

const TICKET = 7;
const BRANCH = `ticket-${TICKET}`;
const ATTEMPTS = 3;
const FLOOR = { base: ["90", "95"], merged: ["91", "94"], ticket: ["92", "94"], v1: ["91", "95"] } as const;

const rules: MergeRules = {
  adrs: "docs/adr",
  appendOnly: ["migrations.ts"],
  hunks: [
    { file: "migrations.ts", resolve: "append" },
    { file: "floor.ts", resolve: "lower" },
  ],
  regenerate: [{ command: ["sh", "-c", "cat src/*.txt > gen/out.txt"], files: "^gen/" }],
};

function git(cwd: string, ...args: readonly string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function commit(dir: string, message: string, files: Readonly<Record<string, string>>): void {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", message);
}

function generated(...sources: readonly string[]): string {
  return sources.map((source) => `${source}\n`).join("");
}

function migrations(...entries: readonly string[]): string {
  const listed = entries.map((entry) => `  \`CREATE TABLE ${entry} (\n     id TEXT\n   ) STRICT;\`,\n`).join("");
  return `const migrations = [\n${listed}];\n`;
}

function floor([branches, lines]: readonly [string, string]): string {
  return `export default {\n  thresholds: {\n    branches: ${branches},\n    lines: ${lines},\n  },\n};\n`;
}

function clone(root: string, origin: string, name: string): string {
  const dir = path.join(root, name);
  git(root, "init", "-q", "-b", "v1", dir);
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "commit.gpgsign", "false");
  git(dir, "remote", "add", "origin", origin);
  return dir;
}

function temporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "merge-ticket-"));
  onTestFinished(() => {
    rmSync(root, { force: true, recursive: true });
  });
  return root;
}

function bareOrigin(root: string): string {
  const origin = path.join(root, "origin.git");
  git(root, "init", "-q", "--bare", "-b", "v1", origin);
  return origin;
}

function pushToV1(other: string, files: Readonly<Record<string, string>>): void {
  commit(other, "v1 moves on", files);
  git(other, "push", "-q", "origin", "v1");
}

function repos(): Repos {
  const root = temporaryRoot();
  const origin = bareOrigin(root);
  const work = clone(root, origin, "work");
  const other = clone(root, origin, "other");
  const base = { "floor.ts": floor(FLOOR.base), "gen/out.txt": generated("a"), "migrations.ts": migrations("a") };
  commit(work, "base", {
    ...base,
    "docs/adr/0001-base.md": "# Base\n",
    "notes.txt": "base\n",
    "pnpm-lock.yaml": "base\n",
    "src/a.txt": "a\n",
  });
  git(work, "push", "-q", "origin", "v1");
  git(other, "pull", "-q", "origin", "v1");
  git(work, "checkout", "-q", "-b", BRANCH);
  return { origin, other, root, work };
}

function optionsFor(work: string, overrides: Overrides): MergeOptions {
  const logged: string[] = [];
  return {
    attempts: ATTEMPTS,
    check: ["true"],
    ci: (): Step => DONE,
    cwd: work,
    install: ["true"],
    log: (line): void => {
      logged.push(line);
    },
    migrationsBase: "origin/v1",
    rules,
    ticket: TICKET,
    title: "Add the c table",
    ...overrides,
  };
}

function runMerge(work: string, overrides: Overrides): Merged {
  return mergeTicket(optionsFor(work, overrides));
}

function resolveByHand(work: string, notes: string, fixes: Readonly<Record<string, string>>): void {
  for (const [file, content] of Object.entries({ ...fixes, "notes.txt": notes })) {
    writeFileSync(path.join(work, file), content);
  }
  git(work, "add", "-A");
  git(work, "commit", "-q", "--no-edit");
}

function runContinue(work: string, overrides: Overrides): Merged {
  return continueMerge(optionsFor(work, overrides));
}

interface Repo {
  readonly commit: (message: string, files: Readonly<Record<string, string>>) => void;
  readonly continueMerge: (overrides: Overrides) => Merged;
  readonly merge: (overrides: Overrides) => Merged;
  readonly push: (files: Readonly<Record<string, string>>) => void;
  readonly resolveByHand: (notes: string, fixes?: Readonly<Record<string, string>>) => void;
}

function repo(dir: string): Repo {
  return {
    commit: (message, files): void => {
      commit(dir, message, files);
    },
    continueMerge: (overrides): Merged => runContinue(dir, overrides),
    merge: (overrides): Merged => runMerge(dir, overrides),
    push: (files): void => {
      pushToV1(dir, files);
    },
    resolveByHand: (notes, fixes = {}): void => {
      resolveByHand(dir, notes, fixes);
    },
  };
}

export type { Overrides, Repos };
export { ATTEMPTS, BRANCH, FLOOR, TICKET, floor, generated, git, migrations, repo, repos };
