import { DateTime, Option } from "effect";
import type { RedV1State, V1Run } from "./lib/red-v1.ts";
import { ran, readRedV1 } from "./lib/red-v1-read.ts";
import type { Outcome } from "./lib/tools.ts";
import { appendFileSync } from "node:fs";
import { applyRedV1 } from "./lib/red-v1-apply.ts";
import { decideAfterWaiting } from "./lib/release-wait.ts";
import { fail } from "./lib/tools.ts";
import { parseArgs } from "node:util";
import { redV1Decision } from "./lib/red-v1.ts";
import { setTimeout } from "node:timers/promises";

const SCRIPT = "red-v1";
const RERUN = 2;
const NONE = 0;

const { values } = parseArgs({
  options: {
    "assume-reruns-fail": { type: "boolean" },
    at: { type: "string" },
    "dry-run": { type: "boolean" },
    summary: { type: "string" },
  },
});

const dryRun = values["dry-run"] === true;
const at = values.at ?? null;
const lines: string[] = [];

function log(line: string): void {
  lines.push(line);
  console.log(`${SCRIPT}: ${line}`);
}

function nowMillis(): number {
  if (at === null) {
    return DateTime.toEpochMillis(DateTime.nowUnsafe());
  }
  return Option.match(DateTime.make(at), {
    onNone: () => fail(SCRIPT, `--at ${at} is not a time`),
    onSome: DateTime.toEpochMillis,
  });
}

function rerunFailed(run: V1Run): V1Run {
  if (run.conclusion !== "failure") {
    return run;
  }
  return { ...run, attempt: Math.max(run.attempt, RERUN) };
}

function assumed(state: RedV1State): RedV1State {
  if (values["assume-reruns-fail"] !== true) {
    return state;
  }
  if (!dryRun) {
    return fail(SCRIPT, "--assume-reruns-fail only goes with --dry-run");
  }
  return { ...state, runs: state.runs.map((run) => rerunFailed(run)) };
}

const seams = { cwd: process.cwd(), gh: ["gh"], git: ["git"] };

function summarise(): void {
  if (typeof values.summary === "string" && values.summary !== "") {
    appendFileSync(values.summary, `### Red v1\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n`);
  }
}

function decided(state: RedV1State): ReturnType<typeof redV1Decision> {
  const decision = redV1Decision(assumed(state));
  for (const line of decision.lines) {
    log(line);
  }
  if (decision.actions.length === NONE && decision.lines.length === NONE) {
    log("nothing to do: v1 is green, or its red run is waiting for its rerun");
  }
  return decision;
}

interface Retry {
  readonly retryAtMillis?: number;
}

const NO_RETRY: Outcome<Retry> = { ok: true, value: {} };

function fetchV1(): Outcome<string> {
  if (dryRun) {
    return { ok: true, value: "" };
  }
  return ran({ args: ["fetch", "--quiet", "origin", "v1"], command: seams.git, cwd: seams.cwd });
}

function retryOf(decision: ReturnType<typeof redV1Decision>): Outcome<Retry> {
  const { retryAtMillis } = decision;
  if (dryRun || typeof retryAtMillis !== "number") {
    return NO_RETRY;
  }
  log("deciding again then, in this run");
  return { ok: true, value: { retryAtMillis } };
}

function readV1(): ReturnType<typeof readRedV1> {
  const fetched = fetchV1();
  if (!fetched.ok) {
    return fetched;
  }
  return readRedV1({ ...seams, at, nowMillis: nowMillis() });
}

function decideAndApply(): Outcome<Retry> {
  const read = readV1();
  if (!read.ok) {
    return read;
  }
  const decision = decided(read.value.state);
  const applying = { ...seams, commits: read.value.commits, dryRun, log };
  const applied = applyRedV1({ actions: decision.actions, applying });
  if (!applied.ok) {
    return applied;
  }
  return retryOf(decision);
}

const outcome = await decideAfterWaiting({
  decide: decideAndApply,
  nowMillis: () => DateTime.toEpochMillis(DateTime.nowUnsafe()),
  sleep: async (millis) => {
    await setTimeout(millis);
  },
});
summarise();
if (!outcome.ok) {
  fail(SCRIPT, outcome.reason);
}
