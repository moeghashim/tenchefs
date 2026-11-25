import { changedFiles } from "./lib/changed-files.ts";
import { lintable } from "./lib/fix-until-stable.ts";
import { parseArgs } from "node:util";
import { ruleSummary } from "./lib/lint-summary.ts";
import { spawnSync } from "node:child_process";
import { unwrap } from "./lib/tools.ts";
import { verdictLine } from "./lib/verdict.ts";

interface Named {
  readonly command: readonly string[];
  readonly name: string;
}

const SCRIPT = "lint:changed";
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NONE = 0;
const TYPES: Named = { command: ["node_modules/.bin/tsc", "--noEmit", "--incremental"], name: "types" };
const KNIP: Named = { command: ["pnpm", "run", "--silent", "knip"], name: "knip" };

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { base: { default: "origin/v1", type: "string" } },
});

function filesToLint(): readonly string[] {
  if (positionals.length > NONE) {
    return positionals;
  }
  return unwrap(SCRIPT, changedFiles({ base: values.base, cwd: process.cwd() }));
}

interface Ran {
  readonly name: string;
  readonly passed: boolean;
  readonly reported: string;
}

function run({ command, name }: Named): Ran {
  const [program = "true", ...rest] = command;
  const ran = spawnSync(program, rest, { encoding: "utf8", stdio: ["inherit", "inherit", "pipe"] });
  process.stderr.write(ran.stderr);
  return { name, passed: ran.status === EXIT_SUCCESS, reported: ran.stderr };
}

function checksOf(files: readonly string[]): readonly Named[] {
  if (files.length === NONE) {
    return [TYPES, KNIP];
  }
  return [{ command: ["node", "scripts/lint-ratchet.ts", ...files], name: "lint" }, TYPES, KNIP];
}

function exitCodeOf(checks: readonly Named[]): number {
  const ran = checks.map((check) => run(check));
  for (const line of ruleSummary(ran.flatMap(({ reported }) => reported.split("\n")))) {
    console.error(line);
  }
  const failed = ran.filter(({ passed }) => !passed).map(({ name }) => name);
  console.log(verdictLine(failed));
  if (failed.length === NONE) {
    return EXIT_SUCCESS;
  }
  return EXIT_FAILURE;
}

process.exitCode = exitCodeOf(checksOf(filesToLint().filter((file) => lintable(file))));
