import type { Finished } from "./lib/ran-at-once.ts";
import { changedFiles } from "./lib/changed-files.ts";
import { lintable } from "./lib/fix-until-stable.ts";
import { parseArgs } from "node:util";
import { ranAtOnce } from "./lib/ran-at-once.ts";
import { ruleSummary } from "./lib/lint-summary.ts";
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
  readonly finished: Finished;
  readonly name: string;
}

async function run({ command, name }: Named): Promise<Ran> {
  const [program = "true", ...args] = command;
  return { finished: await ranAtOnce({ args, program }), name };
}

function checksOf(files: readonly string[]): readonly Named[] {
  if (files.length === NONE) {
    return [TYPES, KNIP];
  }
  return [{ command: ["node", "scripts/lint-ratchet.ts", ...files], name: "lint" }, TYPES, KNIP];
}

function printed(ran: readonly Ran[]): void {
  for (const { finished } of ran) {
    process.stdout.write(finished.stdout);
    process.stderr.write(finished.stderr);
  }
  for (const line of ruleSummary(ran.flatMap(({ finished }) => finished.stderr.split("\n")))) {
    console.error(line);
  }
}

async function exitCodeOf(checks: readonly Named[]): Promise<number> {
  const ran = await Promise.all(
    checks.map(async (check) => {
      const finished = await run(check);
      return finished;
    }),
  );
  printed(ran);
  const failed = ran.filter(({ finished }) => finished.status !== EXIT_SUCCESS).map(({ name }) => name);
  console.log(verdictLine(failed));
  if (failed.length === NONE) {
    return EXIT_SUCCESS;
  }
  return EXIT_FAILURE;
}

process.exitCode = await exitCodeOf(checksOf(filesToLint().filter((file) => lintable(file))));
