import { appendFileSync, readFileSync } from "node:fs";
import { DateTime } from "effect";
import type { Outcome } from "./tools.ts";
import path from "node:path";
import { spawnSync } from "node:child_process";

interface Recording {
  readonly cwd: string;
  readonly milliseconds: number;
  readonly stage: string;
}

interface Timing {
  readonly cwd: string;
  readonly exit: Promise<number>;
  readonly stage: string;
}

interface Reading {
  readonly log: Outcome<string>;
  readonly stage: string;
}

const STAGE_LOG = "stage-times.log";
const EXIT_SUCCESS = 0;
const FIELDS = 3;
const STAGE_FIELD = 1;
const TIME_FIELD = 2;

function stageLogPath(cwd: string): Outcome<string> {
  const ran = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd, encoding: "utf8" });
  if (ran.status !== EXIT_SUCCESS) {
    return { ok: false, reason: `git rev-parse --git-common-dir failed: ${ran.stderr.trim()}` };
  }
  return { ok: true, value: path.resolve(cwd, ran.stdout.trim(), STAGE_LOG) };
}

function recordStageTime({ cwd, milliseconds, stage }: Recording): boolean {
  try {
    const log = stageLogPath(cwd);
    if (!log.ok) {
      return false;
    }
    const at = DateTime.formatIso(DateTime.nowUnsafe());
    appendFileSync(log.value, `${at}\t${stage}\t${Math.round(milliseconds)}\n`);
    return true;
  } catch {
    return false;
  }
}

async function timedStage({ cwd, exit, stage }: Timing): Promise<number> {
  const code = await exit;
  recordStageTime({ cwd, milliseconds: performance.now(), stage });
  return code;
}

function readStageLog(cwd: string): Outcome<string> {
  const log = stageLogPath(cwd);
  if (!log.ok) {
    return log;
  }
  try {
    return { ok: true, value: readFileSync(log.value, "utf8") };
  } catch {
    return { ok: false, reason: `no log yet at ${log.value}` };
  }
}

function timeOf(line: string, stage: string): readonly number[] {
  const fields = line.split("\t");
  const time = fields[TIME_FIELD] ?? "";
  if (fields.length !== FIELDS || fields[STAGE_FIELD] !== stage || time === "") {
    return [];
  }
  return [Number(time)].filter((milliseconds) => Number.isFinite(milliseconds));
}

function localStageTimes({ log, stage }: Reading): Outcome<readonly number[]> {
  if (!log.ok) {
    return log;
  }
  const times = log.value.split("\n").flatMap((line) => timeOf(line, stage));
  return { ok: true, value: times.toReversed() };
}

export { localStageTimes, readStageLog, timedStage };
