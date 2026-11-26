import type { Outcome } from "./lib/tools.ts";
import { addUnreleasedChangeset } from "./lib/release-changeset.ts";
import { fail } from "./lib/tools.ts";
import { spawnSync } from "node:child_process";

const SCRIPT = "release-changeset";
const EXIT_SUCCESS = 0;
const TIMEOUT_MS = 60_000;

function git(args: readonly string[]): Outcome<string> {
  const ran = spawnSync("git", args, { encoding: "utf8", timeout: TIMEOUT_MS });
  if (ran.status !== EXIT_SUCCESS) {
    return { ok: false, reason: `git ${args.join(" ")} failed: ${`${ran.stderr}${String(ran.error ?? "")}`.trim()}` };
  }
  return { ok: true, value: ran.stdout };
}

const added = addUnreleasedChangeset({ directory: ".changeset", git });
if (added.ok) {
  console.log(`${SCRIPT}: ${added.value}`);
} else {
  fail(SCRIPT, added.reason);
}
