import type { Diagnostic, Outcome } from "./tools.ts";
import { existsSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { reportOf } from "./tools.ts";

interface FixRun {
  readonly check: readonly string[];
  readonly fix: readonly string[];
  readonly format: readonly string[];
  readonly passesLeft: number;
  readonly paths: readonly string[];
  readonly suggest: readonly string[];
}

interface Scope {
  readonly files: readonly string[];
  readonly ignored: readonly string[];
}

const BIOME = "node_modules/.bin/biome";
const FORMAT = [
  "format",
  "--write",
  "--no-errors-on-unmatched",
  "--files-ignore-unknown=true",
  "--vcs-use-ignore-file=false",
];
const FIX_CONFIG = ".oxlintrc.fix.json";
const SUGGEST_CONFIG = "lint/suggest.oxlintrc.json";
const SUGGESTED = new Set(["effecttsgo(deterministic-keys)"]);
const MAX_FIX_PASSES = 10;
const NONE = 0;
const ONE_PASS = 1;
const FAILED = 1;
const LINTED = /\.[cm]?[jt]sx?$/u;

function lintable(file: string): boolean {
  return LINTED.test(file);
}

function wholeRepo(ignored: readonly string[]): readonly string[] {
  const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
  return listed.stdout
    .split("\n")
    .filter((file) => lintable(file) && !ignored.some((pattern) => path.matchesGlob(file, pattern)));
}

function snapshot(files: readonly string[]): string {
  return files
    .map((file) => {
      if (existsSync(file)) {
        return readFileSync(file, "utf8");
      }
      return "";
    })
    .join("\0");
}

function statusOf(closed: readonly unknown[]): number {
  const [code] = closed;
  if (typeof code === "number") {
    return code;
  }
  return FAILED;
}

interface Spawned {
  readonly status: number;
  readonly stderr: string;
  readonly stdout: string;
}

async function spawned(program: string, args: readonly string[]): Promise<Outcome<Spawned>> {
  const child = spawn(program, args);
  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout.on("data", (chunk: unknown) => {
    stdout.push(String(chunk));
  });
  child.stderr.on("data", (chunk: unknown) => {
    stderr.push(String(chunk));
  });
  try {
    const closed: readonly unknown[] = await once(child, "close");
    return { ok: true, value: { status: statusOf(closed), stderr: stderr.join(""), stdout: stdout.join("") } };
  } catch (error) {
    return { ok: false, reason: `${program} could not run (${String(error)}). Run pnpm install.` };
  }
}

async function lint(args: readonly string[]): Promise<Outcome<readonly Diagnostic[]>> {
  const ran = await spawned("node_modules/.bin/effect-tsgo", ["oxlint", "--type-aware", "-f", "json", ...args]);
  if (!ran.ok) {
    return ran;
  }
  return reportOf(ran.value);
}

async function formatted(files: readonly string[]): Promise<Outcome<string>> {
  if (files.length === NONE) {
    return { ok: true, value: "" };
  }
  const ran = await spawned(BIOME, [...FORMAT, ...files]);
  if (!ran.ok) {
    return ran;
  }
  if (ran.value.status === NONE) {
    return { ok: true, value: ran.value.stdout };
  }
  return { ok: false, reason: `biome could not format the files:\n${ran.value.stdout}${ran.value.stderr}`.trim() };
}

async function fixedThenFormatted(run: FixRun): Promise<Outcome<unknown>> {
  const fixed = await lint(["--fix", ...run.fix]);
  if (!fixed.ok) {
    return fixed;
  }
  return formatted(run.format);
}

function suggestedIn(checked: Outcome<readonly Diagnostic[]>): readonly string[] {
  if (!checked.ok) {
    return [];
  }
  const files = checked.value.filter(({ code }) => SUGGESTED.has(code)).map(({ filename }) => filename);
  return [...new Set(files)];
}

async function suggestAfterFix(
  run: FixRun,
  fixed: Outcome<unknown>,
  checked: Outcome<readonly Diagnostic[]>,
): Promise<Outcome<unknown>> {
  if (!fixed.ok) {
    return fixed;
  }
  const files = suggestedIn(checked);
  if (files.length === NONE) {
    return checked;
  }
  const suggested = await lint([...run.suggest, ...files]);
  return suggested;
}

export function repoFixRun(scope: Scope): FixRun {
  const check = ["--disable-nested-config", ...scope.files];
  const suggest = ["--fix-suggestions", "-c", SUGGEST_CONFIG, "--disable-nested-config"];
  if (scope.files.length > NONE) {
    const fix = ["-c", FIX_CONFIG, ...check];
    return { check, fix, format: scope.files, passesLeft: MAX_FIX_PASSES, paths: scope.files, suggest };
  }
  const paths = wholeRepo(scope.ignored);
  const fix = ["-c", FIX_CONFIG, "--disable-nested-config", ...paths];
  return { check, fix, format: paths, passesLeft: MAX_FIX_PASSES, paths, suggest };
}

export async function lintFixed(run: FixRun): Promise<Outcome<readonly Diagnostic[]>> {
  if (run.passesLeft === NONE) {
    return lint(run.check);
  }
  const before = snapshot(run.paths);
  const [fixed, checked] = await Promise.all([fixedThenFormatted(run), lint(run.check)]);
  const settled = await suggestAfterFix(run, fixed, checked);
  if (!settled.ok) {
    return settled;
  }
  if (snapshot(run.paths) === before) {
    return checked;
  }
  return lintFixed({ ...run, passesLeft: run.passesLeft - ONE_PASS });
}

export { lint, lintable };
