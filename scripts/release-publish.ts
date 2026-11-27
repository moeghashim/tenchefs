import type { Outcome, Run } from "./lib/tools.ts";
import { field, parseJson, text } from "./lib/json.ts";
import { readFileSync, readdirSync } from "node:fs";
import { fail } from "./lib/tools.ts";
import { releasePlan } from "./lib/release-publish.ts";
import { spawnSync } from "node:child_process";

const SCRIPT = "release-publish";
const TIMEOUT_MS = 60_000;

function npm(args: readonly string[]): Outcome<Run> {
  const ran = spawnSync("npm", args, { encoding: "utf8", timeout: TIMEOUT_MS });
  if (ran.error instanceof Error) {
    return { ok: false, reason: `npm ${args.join(" ")} could not run: ${ran.error.message}` };
  }
  return { ok: true, value: { status: ran.status, stderr: ran.stderr, stdout: ran.stdout } };
}

function isChangeset(name: string): boolean {
  return name.endsWith(".md") && name !== "README.md";
}

const manifest = parseJson(readFileSync("package.json", "utf8"));
const version = text(field(manifest, "version")) ?? fail(SCRIPT, "package.json has no version");
const pending = readdirSync(".changeset").filter((name) => isChangeset(name));
const planned = releasePlan({ ci: process.argv.includes("--ci"), npm, pending, version });
if (planned.ok) {
  for (const line of planned.value.lines) {
    console.error(`${SCRIPT}: ${line}`);
  }
  console.log(`publish=${String(planned.value.publish)}`);
} else {
  fail(SCRIPT, planned.reason);
}
