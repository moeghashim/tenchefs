import { DONE, stop } from "../../lib/merge-steps.ts";
import type { Landing, PullRequest } from "../../lib/merge-pull-request.ts";
import type { MergeOptions, Merged } from "../../lib/merge-ticket.ts";
import type { Step, Stopped } from "../../lib/merge-steps.ts";
import { continueMerge, mergeTicket } from "../../lib/merge-ticket.ts";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { MergeRules } from "../../lib/merge-resolve.ts";
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
  readonly ci?: (branch: string, sha: string) => Step;
  readonly install?: readonly string[];
  readonly approved?: string;
  readonly log?: (line: string) => void;
  readonly migrationsBase?: string;
  readonly pullRequest?: (landing: Landing) => PullRequest | Stopped;
  readonly rules?: MergeRules;
}

const TICKET = 7;
const INDENT = 2;
const START = 0;
const SHORT = 12;
const BRANCH = `ticket-${TICKET}`;
const ATTEMPTS = 3;
const PR = { number: 9, url: "https://github.com/o/r/pull/9" } as const;
const FLOOR = { base: ["90", "95"], merged: ["91", "94"], ticket: ["92", "94"], v1: ["91", "95"] } as const;

const OXLINT_CONFIG = {
  categories: { correctness: "error" },
  ignorePatterns: ["coverage/**"],
  overrides: [{ files: ["scripts/**"], rules: { "node/no-sync": "off" } }],
  plugins: ["eslint", "unicorn"],
  rules: { "func-style": ["error", "declaration"], "no-console": "error", "no-debugger": "warn" },
} as const;
const OPT_OUTS =
  "# Lint opt-outs\n\n## Off in some files\n\n- `node/no-sync`, in `scripts/`: a script uses the sync APIs.\n";
const DEPENDENCY_CRUISER = 'module.exports = {\n  forbidden: [{ name: "no-circular", severity: "error" }],\n};\n';

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

function oxlint(config: unknown): string {
  return `${JSON.stringify(config, null, INDENT)}\n`;
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
  git(origin, "config", "receive.denyNonFastForwards", "true");
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
    ".dependency-cruiser.cjs": DEPENDENCY_CRUISER,
    ".oxlintrc.json": oxlint(OXLINT_CONFIG),
    "docs/adr/0001-base.md": "# Base\n",
    "docs/lint-opt-outs.md": OPT_OUTS,
    "notes.txt": "base\n",
    "pnpm-lock.yaml": "base\n",
    "src/a.txt": "a\n",
  });
  git(work, "push", "-q", "origin", "v1");
  git(other, "pull", "-q", "origin", "v1");
  git(work, "checkout", "-q", "-b", BRANCH);
  return { origin, other, root, work };
}

function attemptOf(sha: string): string {
  return `merge-ticket-${TICKET}-${sha.slice(START, SHORT)}`;
}

function pushedBranch(origin: string): string {
  return git(origin, "branch", "--list", "--format=%(refname:short)")
    .split("\n")
    .filter((branch) => branch !== "v1")
    .join("\n");
}

function fakePullRequests(): {
  readonly landings: readonly Landing[];
  readonly pullRequest: (landing: Landing) => PullRequest;
} {
  const landings: Landing[] = [];
  return {
    landings,
    pullRequest: (landing): PullRequest => {
      landings.push(landing);
      return PR;
    },
  };
}

function redCi(): Step {
  return stop(`merge-ticket-${TICKET}'s latest Check run is red: browser 1/3 (failure).`);
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
    pullRequest: (): PullRequest => PR,
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

function resolvedByHand(): Repos {
  const repositories = repos();
  const { other, work } = repositories;
  repo(other).push({ "notes.txt": "v1\n" });
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  repo(work).merge({});
  repo(work).resolveByHand("both\n");
  return repositories;
}

export type { Overrides, Repos };
export {
  ATTEMPTS,
  BRANCH,
  DEPENDENCY_CRUISER,
  FLOOR,
  OPT_OUTS,
  OXLINT_CONFIG,
  TICKET,
  attemptOf,
  fakePullRequests,
  floor,
  generated,
  git,
  migrations,
  oxlint,
  pushedBranch,
  redCi,
  repo,
  repos,
  resolvedByHand,
};
