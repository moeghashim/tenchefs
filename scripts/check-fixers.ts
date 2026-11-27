import type { Diagnostic, Outcome } from "./lib/tools.ts";
import { cpSync, readdirSync, rmSync } from "node:fs";
import { fail, tool, unwrap } from "./lib/tools.ts";
import { lint, lintFixed } from "./lib/fix-until-stable.ts";
import path from "node:path";

const SCRIPT = "check-fixers";
const FIXTURE = "lint/fixers";
const RUN = "lint/fixers-run";
const TREE = `${RUN}/app`;
const MAX_FIX_PASSES = 10;
const SOURCE = /\.tsx?$/u;
const NONE = 0;
const ONE = 1;
const PASSED = 0;
const check = ["-c", `${RUN}/.oxlintrc.json`, "--disable-nested-config", TREE];
const fix = ["-c", `${RUN}/.oxlintrc.fix.json`, "--disable-nested-config", TREE];
const suggest = ["--fix-suggestions", "-c", "lint/suggest.oxlintrc.json", "--disable-nested-config"];
const pristine = ["-c", `${FIXTURE}/.oxlintrc.json`, "--disable-nested-config", `${FIXTURE}/app`];

function tally(diagnostics: readonly Diagnostic[], root: string): ReadonlyMap<string, number> {
  const totals = new Map<string, number>();
  for (const { code, filename } of diagnostics) {
    const key = `${path.relative(root, filename)} ${code}`;
    totals.set(key, (totals.get(key) ?? NONE) + ONE);
  }
  return totals;
}

function total(counts: ReadonlyMap<string, number>): number {
  return [...counts.values()].reduce((sum, count) => sum + count, NONE);
}

async function fixThenSuggest(): Promise<Outcome<readonly Diagnostic[]>> {
  const fixedOnce = await lint(["--fix", ...fix]);
  if (!fixedOnce.ok) {
    return fixedOnce;
  }
  const suggested = await lint([...suggest, TREE]);
  return suggested;
}

function removeRun(): void {
  rmSync(RUN, { force: true, recursive: true });
}

removeRun();
process.on("exit", removeRun);
cpSync(FIXTURE, RUN, { recursive: true });
cpSync(".oxlintrc.fix.json", `${RUN}/.oxlintrc.fix.json`);
const paths = readdirSync(TREE, { encoding: "utf8", recursive: true })
  .filter((name) => SOURCE.test(name))
  .map((name) => path.join(TREE, name));

const [found, firstFix] = await Promise.all([lint(pristine), fixThenSuggest()]);
unwrap(SCRIPT, firstFix);
const before = tally(unwrap(SCRIPT, found), FIXTURE);
const fixed = await lintFixed({ check, fix, format: [], passesLeft: MAX_FIX_PASSES - ONE, paths, suggest });
const after = tally(unwrap(SCRIPT, fixed), RUN);
const raised: string[] = [];
for (const [key, count] of after) {
  if (count > (before.get(key) ?? NONE)) {
    raised.push(`${key}: ${before.get(key) ?? NONE} before the fix, ${count} after. A fixer broke another rule.`);
  }
}
for (const line of raised) {
  console.error(line);
}
const compiled = unwrap(SCRIPT, tool("tsc", ["-p", `${RUN}/tsconfig.json`, "--noEmit"]));

if (compiled.status !== PASSED) {
  fail(SCRIPT, `the fixed tree no longer compiles:\n${compiled.stdout}`);
}
if (total(after) >= total(before)) {
  fail(SCRIPT, `the fix removed nothing (${total(before)} before, ${total(after)} after)`);
}
process.exitCode = raised.length;
