import { execFileSync, spawnSync } from "node:child_process";
import { expect, it, onTestFinished } from "vitest";
import { field, parseJson, text as textOf } from "../lib/json.ts";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { changedFiles } from "../lib/changed-files.ts";
import path from "node:path";
import { ranAtOnce } from "../lib/ran-at-once.ts";
import { tmpdir } from "node:os";

const FIXTURES = ".vitest";
const PASSED = 0;
const FAILED = 1;
const SUMMARY = -2;
const LAST = -1;
const VIOLATION = "export const total = 7 * 6;\n";
const CLEAN = 'export const greeting = "hello";\n';
const SETUP = [
  ["init", "-q", "-b", "v1"],
  ["config", "user.email", "test@example.com"],
  ["config", "user.name", "Test"],
  ["add", "."],
  ["commit", "-q", "-m", "first"],
  ["checkout", "-q", "-b", "ticket-7"],
] as const;

interface Ran {
  readonly output: string;
  readonly status: number | null;
  readonly stdout: string;
}

function fixture(content: string): string {
  mkdirSync(FIXTURES, { recursive: true });
  const dir = mkdtempSync(path.join(FIXTURES, "lint-changed-"));
  onTestFinished(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  const file = path.join(dir, "fixture.ts");
  writeFileSync(file, content);
  return file;
}

function nodeIn(cwd: string, ...args: readonly string[]): Ran {
  const ran = spawnSync("node", args, { cwd, encoding: "utf8" });
  return { output: `${ran.stdout}${ran.stderr}`, status: ran.status, stdout: ran.stdout };
}

async function node(...args: readonly string[]): Promise<Ran> {
  const { status, stderr, stdout } = await ranAtOnce({ args, program: "node" });
  return { output: `${stdout}${stderr}`, status, stdout };
}

async function changedAndHook(
  content: string,
): Promise<{ readonly changed: Ran; readonly file: string; readonly hook: Ran }> {
  const file = fixture(content);
  const [changed, hook] = await Promise.all([
    node("scripts/lint-changed.ts", file),
    node("scripts/lint-ratchet.ts", "--fix", fixture(content)),
  ]);
  return { changed, file, hook };
}

function lastLine(text: string): string {
  return text.trimEnd().split("\n").at(LAST) ?? "";
}

function git(cwd: string, ...args: readonly string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function write(dir: string, files: Readonly<Record<string, string>>): void {
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, file), content);
  }
}

function branchRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lint-changed-"));
  onTestFinished(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  write(dir, { "deleted.ts": "a\n", "kept.ts": "a\n", "unstaged.ts": "a\n" });
  for (const args of SETUP) {
    git(dir, ...args);
  }
  return dir;
}

it("lists unstaged, staged and untracked changes against the base, but not deleted files", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const dir = branchRepo();
  write(dir, { "staged.ts": "b\n", "unstaged.ts": "b\n", "untracked.ts": "b\n" });
  git(dir, "add", "staged.ts");
  git(dir, "rm", "-q", "deleted.ts");

  expect(changedFiles({ base: "v1", cwd: dir })).toStrictEqual({
    ok: true,
    value: ["staged.ts", "unstaged.ts", "untracked.ts"],
  });
});

it("reports a violation once in the hook's format and fails as the hook does", { timeout: 60_000 }, async () => {
  expect.hasAssertions();

  const { changed, file, hook } = await changedAndHook(VIOLATION);

  const reported = changed.output.split("\n").filter((line) => line.startsWith(`${file}:`));

  expect([changed.status, hook.status, reported]).toStrictEqual([
    FAILED,
    FAILED,
    [`${file}:1 eslint(no-magic-numbers) No magic number: 7`, `${file}:1 eslint(no-magic-numbers) No magic number: 6`],
  ]);
  expect(changed.output).toContain("2 new violations in 1 file");
  expect(changed.output.trimEnd().split("\n").slice(SUMMARY)).toStrictEqual([
    "By rule (2 violations; the full list is above):",
    `  2 eslint(no-magic-numbers), e.g. ${file}:1 No magic number: 7`,
  ]);
  expect(lastLine(changed.stdout)).toBe("RESULT: FAIL (lint)");
});

it("passes a clean file as the hook does", { timeout: 60_000 }, async () => {
  expect.hasAssertions();

  const { changed, hook } = await changedAndHook(CLEAN);

  expect([changed.status, hook.status]).toStrictEqual([PASSED, PASSED]);
  expect(lastLine(changed.stdout)).toBe("RESULT: PASS");
});

it("fails a file the formatter grows past the line limit in the hook as in lint:changed", {
  timeout: 60_000,
}, async () => {
  expect.hasAssertions();

  const words = Array.from({ length: 400 }, () => '"a"').join(",");
  const file = fixture(`export const words = [${words}];\n`);
  const hook = await node("scripts/lint-ratchet.ts", "--fix", file);
  const changed = await node("scripts/lint-changed.ts", file);
  const tooLong = `${file}:402 eslint(max-lines) File has too many lines (402).`;

  expect([hook.status, changed.status]).toStrictEqual([FAILED, FAILED]);
  expect(hook.output).toContain(tooLong);
  expect(changed.output).toContain(tooLong);
});

function rootKnipScript(): string | undefined {
  const manifest = parseJson(readFileSync("package.json", "utf8"));
  return textOf(field(field(manifest, "scripts"), "knip"));
}

function unusedExportRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lint-changed-knip-"));
  onTestFinished(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  symlinkSync(path.resolve("node_modules"), path.join(dir, "node_modules"));
  write(dir, {
    "knip.json": JSON.stringify({ workspaces: { ".": { entry: ["main.ts!"], project: ["*.ts!"] } } }),
    "lib.ts": "export const used = 1;\nexport const unused = 2;\n",
    "main.ts": 'import { used } from "./lib.ts";\n\nexport const doubled = used + used;\n',
    "package.json": JSON.stringify({
      name: "fixture",
      private: true,
      scripts: { knip: rootKnipScript() },
      type: "module",
    }),
    "tsconfig.json": JSON.stringify({
      compilerOptions: { allowImportingTsExtensions: true, module: "nodenext", noEmit: true, strict: true, types: [] },
    }),
  });
  for (const args of SETUP) {
    git(dir, ...args);
  }
  return dir;
}

it("fails on an unused export with knip's report, before pnpm check would", { timeout: 60_000 }, () => {
  expect.hasAssertions();

  const dir = unusedExportRepo();
  const changed = nodeIn(dir, path.resolve("scripts/lint-changed.ts"), "--base", "v1");

  expect(changed.status).toBe(FAILED);
  expect(changed.output).toMatch(/unused\s+lib\.ts:2:14/u);
  expect(lastLine(changed.stdout)).toBe("RESULT: FAIL (knip)");
});
