import type { Outcome } from "./lib/tools.ts";
import { fail } from "./lib/tools.ts";
import { spawnSync } from "node:child_process";
import { versionOnChosen } from "./lib/release-version.ts";

const SCRIPT = "release-version";
const EXIT_SUCCESS = 0;
const TIMEOUT_MS = 120_000;
const FIRST_ARGUMENT = 2;

function run(command: string, args: readonly string[]): Outcome<string> {
  const ran = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"],
    timeout: TIMEOUT_MS,
  });
  if (ran.status !== EXIT_SUCCESS) {
    return {
      ok: false,
      reason: `${command} ${args.join(" ")} failed ${String(ran.error ?? `with status ${ran.status}`)}`,
    };
  }
  return { ok: true, value: "" };
}

const [sha = ""] = process.argv.slice(FIRST_ARGUMENT);
const versioned = versionOnChosen({
  git: (args) => run("git", args),
  sha,
  version: () => run("pnpm", ["run", "version"]),
});
if (versioned.ok) {
  console.log(`${SCRIPT}: ${versioned.value}`);
} else {
  fail(SCRIPT, versioned.reason);
}
