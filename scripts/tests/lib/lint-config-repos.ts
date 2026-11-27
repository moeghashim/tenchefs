import { builtOnce, writeSnapshot } from "./directory-snapshot.ts";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { Snapshot } from "./directory-snapshot.ts";
import { execFileSync } from "node:child_process";
import { onTestFinished } from "vitest";
import path from "node:path";
import { tmpdir } from "node:os";

interface Repos {
  readonly origin: string;
  readonly root: string;
  readonly work: string;
}

interface Repo {
  readonly commit: (message: string, files: Readonly<Record<string, string>>) => void;
}

const INDENT = 2;
const BRANCH = "ticket-7";
const ORIGIN = "origin.git";
const WORK = "work";

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

function oxlint(config: unknown): string {
  return `${JSON.stringify(config, null, INDENT)}\n`;
}

function temporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "lint-config-"));
  onTestFinished(() => {
    rmSync(root, { force: true, recursive: true });
  });
  return root;
}

function clone(root: string, origin: string): string {
  const work = path.join(root, WORK);
  git(root, "init", "-q", "--template=", "-b", "v1", work);
  mkdirSync(path.join(work, ".git", "hooks"));
  git(work, "config", "user.name", "Test");
  git(work, "config", "user.email", "test@example.com");
  git(work, "config", "commit.gpgsign", "false");
  git(work, "remote", "add", "origin", origin);
  return work;
}

function build(root: string): void {
  const origin = path.join(root, ORIGIN);
  git(root, "init", "-q", "--template=", "--bare", "-b", "v1", origin);
  mkdirSync(path.join(origin, "hooks"));
  const work = clone(root, origin);
  commit(work, "base", {
    ".dependency-cruiser.cjs": DEPENDENCY_CRUISER,
    ".oxlintrc.json": oxlint(OXLINT_CONFIG),
    "docs/lint-opt-outs.md": OPT_OUTS,
    "notes.txt": "base\n",
  });
  git(work, "push", "-q", "origin", "v1");
  git(work, "checkout", "-q", "-b", BRANCH);
}

function pointedAtOrigin(snapshot: Snapshot, root: string): void {
  const work = path.join(root, WORK);
  const config = path.join(work, ".git", "config");
  writeFileSync(config, readFileSync(config, "utf8").replaceAll(snapshot.root, root));
  git(work, "update-index", "-q", "--refresh");
}

function repos(): Repos {
  const root = temporaryRoot();
  const snapshot = builtOnce({ build, name: "lint-config" });
  writeSnapshot({ root, snapshot });
  pointedAtOrigin(snapshot, root);
  return { origin: path.join(root, ORIGIN), root, work: path.join(root, WORK) };
}

function repo(dir: string): Repo {
  return {
    commit: (message, files): void => {
      commit(dir, message, files);
    },
  };
}

export { BRANCH, DEPENDENCY_CRUISER, OPT_OUTS, OXLINT_CONFIG, git, oxlint, repo, repos };
