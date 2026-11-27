import { execFileSync } from "node:child_process";
import { takenOnV1 } from "./lib/adr-numbers.ts";

const ADRS = "docs/adr/*.md";
const FAILED = 1;

function git(args: readonly string[]): readonly string[] {
  return execFileSync("git", args, { encoding: "utf8" })
    .split("\n")
    .filter((line) => line !== "");
}

const [base = "origin/v1"] = git(["merge-base", "HEAD", "origin/v1"]);
const failures = takenOnV1({
  added: git(["diff", "--name-only", "--no-renames", "--diff-filter=A", base, "HEAD", "--", ADRS]),
  v1: git(["ls-tree", "--name-only", "origin/v1", "--", "docs/adr/"]),
});
for (const failure of failures) {
  console.error(`adr-numbers: ${failure}`);
  process.exitCode = FAILED;
}
