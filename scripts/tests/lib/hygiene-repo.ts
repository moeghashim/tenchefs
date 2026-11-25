import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { onTestFinished } from "vitest";
import path from "node:path";
import { tmpdir } from "node:os";

const SCRIPT = path.resolve("scripts/hygiene.ts");
const PASSED = 0;
const FAILED = 1;
const MINUTE = 60;
const clock = { now: 1_700_000_000 };

interface Run {
  readonly status: number | null;
  readonly stderr: string;
}

function git(dir: string, ...args: readonly string[]): string {
  clock.now += MINUTE;
  const date = `@${clock.now} +0000`;
  return execFileSync("env", [`GIT_AUTHOR_DATE=${date}`, `GIT_COMMITTER_DATE=${date}`, "git", ...args], {
    cwd: dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

type File = readonly [path: string, content: string];

function write(dir: string, ...files: readonly File[]): void {
  for (const [file, content] of files) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  }
}

function commit(dir: string, ...files: readonly File[]): void {
  write(dir, ...files);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", files.map(([file]) => file).join(", "));
}

function repo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "hygiene-"));
  onTestFinished(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  git(dir, "init", "-q", "-b", "v1");
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "commit.gpgsign", "false");
  write(dir, ["pnpm-workspace.yaml", "packages: []\n"], ["README.md", "# Test\n"], [".env.example", ""]);
  return dir;
}

function hygiene(dir: string, ...args: readonly string[]): Run {
  const run = spawnSync("node", [SCRIPT, ...args], { cwd: dir, encoding: "utf8" });
  return { status: run.status, stderr: run.stderr };
}

export type { File, Run };
export { FAILED, PASSED, commit, git, hygiene, repo, write };
