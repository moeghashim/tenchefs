import { DateTime } from "effect";
import type { Outcome } from "./lib/tools.ts";
import { appendFileSync } from "node:fs";
import { decideAfterWaiting } from "./lib/release-wait.ts";
import { fail } from "./lib/tools.ts";
import { parseArgs } from "node:util";
import { releaseChoice } from "./lib/release-commit.ts";
import { releaseGo } from "./lib/release-go.ts";
import { setTimeout } from "node:timers/promises";
import { spawnSync } from "node:child_process";

const SCRIPT = "release-commit";
const EXIT_SUCCESS = 0;
const TIMEOUT_MS = 60_000;

const { values } = parseArgs({
  options: {
    event: { type: "string" },
    output: { type: "string" },
    "run-id": { type: "string" },
    summary: { type: "string" },
  },
});

function command(name: string): (args: readonly string[]) => Outcome<string> {
  return (args) => {
    const ran = spawnSync(name, args, { encoding: "utf8", timeout: TIMEOUT_MS });
    if (ran.status !== EXIT_SUCCESS) {
      return {
        ok: false,
        reason: `${name} ${args.join(" ")} failed: ${`${ran.stderr}${String(ran.error ?? "")}`.trim()}`,
      };
    }
    return { ok: true, value: ran.stdout };
  };
}

function appendTo(file: string | undefined, content: string): void {
  if (typeof file === "string" && file !== "") {
    appendFileSync(file, content);
  }
}

const seams = { gh: command("gh"), git: command("git") };

interface Decided {
  readonly go: boolean;
  readonly line: string;
  readonly promote: boolean;
  readonly retryAtMillis?: number;
  readonly sha: string;
}

function nowMillis(): number {
  return DateTime.toEpochMillis(DateTime.nowUnsafe());
}

function report(lines: readonly string[]): void {
  for (const line of lines) {
    console.log(`${SCRIPT}: ${line}`);
  }
  appendTo(values.summary, `### The commit to release\n\n${lines.map((line) => `- ${line}`).join("\n")}\n\n`);
}

function decidedOn(sha: string): Outcome<Decided> {
  const go = releaseGo({
    asked: { event: values.event ?? "workflow_dispatch", nowMillis: nowMillis(), sha, thisRun: values["run-id"] ?? "" },
    ...seams,
  });
  if (!go.ok) {
    return go;
  }
  console.log(`${SCRIPT}: ${go.value.line}`);
  appendTo(values.summary, `${go.value.line}\n\n`);
  return { ok: true, value: { ...go.value, sha } };
}

function chooseAndDecide(): Outcome<Decided> {
  const fetched = seams.git(["fetch", "--quiet", "origin", "v1", "main"]);
  if (!fetched.ok) {
    return fetched;
  }
  const { lines, outcome } = releaseChoice(seams);
  report(lines);
  if (!outcome.ok) {
    return outcome;
  }
  return decidedOn(outcome.value);
}

const decided = await decideAfterWaiting({
  decide: chooseAndDecide,
  nowMillis,
  sleep: async (millis) => {
    await setTimeout(millis);
  },
});

if (decided.ok) {
  appendTo(
    values.output,
    `sha=${decided.value.sha}\ngo=${String(decided.value.go)}\npromote=${String(decided.value.promote)}\n`,
  );
} else {
  appendTo(values.summary, `Nothing released: ${decided.reason}\n`);
  fail(SCRIPT, decided.reason);
}
