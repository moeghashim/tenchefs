import type { CheckRun, Job } from "./check-run.ts";
import { DateTime, Option } from "effect";
import type { Stopped } from "./merge-steps.ts";
import path from "node:path";
import { readFileSync } from "node:fs";
import { reportJobs } from "./ci-failures.ts";
import { stop } from "./merge-steps.ts";

interface CutOff {
  readonly limit: number;
  readonly name: string;
}

interface Limit {
  readonly exact: boolean;
  readonly limit: number;
  readonly prefix: string;
}

interface Cancelled {
  readonly checkRun: CheckRun;
  readonly cwd: string;
  readonly subject: string;
}

interface Found {
  readonly lines: readonly string[];
  readonly stopped: Stopped;
}

const WORKFLOW = path.join(".github", "workflows", "check.yml");
const JOBS = "\njobs:\n";
const KEY_INDENT = "  ";
const FIELD_INDENT = "    ";
const EXPRESSION = "${{";
const CANCELLED = "cancelled";
const MS_PER_MINUTE = 60_000;
const SLACK_MS = 30_000;
const NONE = 0;
const FIRST = 1;
const AFTER = 1;
const COLON = -1;

function keyOf(line: string): string {
  const trimmed = line.trimEnd();
  if (!trimmed.startsWith(KEY_INDENT) || trimmed.at(KEY_INDENT.length) === " " || !trimmed.endsWith(":")) {
    return "";
  }
  return trimmed.slice(KEY_INDENT.length, COLON);
}

function valueOf(lines: readonly string[], name: string): string {
  const prefix = `${FIELD_INDENT}${name}:`;
  const found = lines.find((line) => line.startsWith(prefix)) ?? prefix;
  return found.slice(prefix.length).trim();
}

function limitOf(block: readonly string[]): readonly Limit[] {
  const [first = ""] = block;
  const shown = valueOf(block, "name") || keyOf(first);
  const limit = Number(valueOf(block, "timeout-minutes"));
  if (!(limit > NONE)) {
    return [];
  }
  const [prefix = ""] = shown.split(EXPRESSION);
  return [{ exact: !shown.includes(EXPRESSION), limit, prefix }];
}

function blocksOf(section: readonly string[]): readonly (readonly string[])[] {
  const after = section.findIndex((line) => line !== "" && !line.startsWith(" ") && !line.startsWith("#"));
  const lines = section.slice(NONE, Math.min(...[after, section.length].filter((end) => end >= NONE)));
  const starts = lines.flatMap((line, index) => [index].filter(() => keyOf(line) !== ""));
  return starts.map((start, index) => lines.slice(start, starts.at(index + AFTER) ?? lines.length));
}

function limitsIn(workflow: string): readonly Limit[] {
  const [, section = ""] = `\n${workflow}`.split(JOBS);
  return blocksOf(section.split("\n"))
    .flatMap((block) => limitOf(block))
    .toSorted((left, right) => Number(right.exact) - Number(left.exact) || right.prefix.length - left.prefix.length);
}

function readLimits(cwd: string): readonly Limit[] {
  try {
    return limitsIn(readFileSync(path.join(cwd, WORKFLOW), "utf8"));
  } catch {
    return [];
  }
}

function matches(limit: Limit, name: string): boolean {
  return (limit.exact && name === limit.prefix) || (!limit.exact && name.startsWith(limit.prefix));
}

function epochMillis(at: string): number {
  return Option.match(DateTime.make(at), { onNone: () => Number.NaN, onSome: DateTime.toEpochMillis });
}

function atLimit(job: Job, limit: Limit): boolean {
  const ranFor = epochMillis(job.completedAt) - epochMillis(job.startedAt);
  return job.conclusion === CANCELLED && ranFor >= limit.limit * MS_PER_MINUTE - SLACK_MS;
}

function cutOffJobs(cwd: string, jobs: readonly Job[]): readonly CutOff[] {
  const limits = readLimits(cwd);
  return jobs.flatMap((job) =>
    limits
      .filter((limit) => matches(limit, job.name))
      .slice(NONE, FIRST)
      .filter((limit) => atLimit(job, limit))
      .map(({ limit }) => ({ limit, name: job.name })),
  );
}

function cutOffStop({ checkRun, cwd, subject }: Cancelled): Found | null {
  const jobs = cutOffJobs(cwd, checkRun.jobs);
  if (jobs.length === NONE) {
    return null;
  }
  const lines: string[] = [];
  reportJobs({
    jobs: checkRun.jobs,
    log: (line) => {
      lines.push(line);
    },
  });
  const named = jobs.map(({ limit, name }) => `${name} was cut off at its time limit of ${limit} minutes`);
  const reason = `${subject}'s latest Check run was cancelled: ${named.join("; ")}. A rerun would hit the same limit, so it was not rerun.\n${checkRun.url}`;
  return { lines, stopped: { ...stop(reason), cutOff: true, jobs: jobs.map(({ name }) => name) } };
}

export { cutOffStop };
