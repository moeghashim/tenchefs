import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { field, list, parseJson, text } from "./json.ts";
import type { FileTiming } from "./slowest-files.ts";
import { parse } from "flatted";
import path from "node:path";

interface Costing {
  readonly blobs: string;
  readonly file: string;
  readonly root: string;
}

const COSTS_REPORT = "tests-costs.json";
const MS_PER_SECOND = 1000;
const NONE = 0;
const PHASES = ["environmentLoad", "prepareDuration", "setupDuration", "collectDuration"];

function msOf(value: unknown): number {
  if (typeof value !== "number") {
    return NONE;
  }
  return value;
}

function costOf(task: unknown, root: string): readonly FileTiming[] {
  const file = text(field(task, "filepath")) ?? "";
  if (file === "") {
    return [];
  }
  const phases = PHASES.reduce((total, phase) => total + msOf(field(task, phase)), NONE);
  const ms = phases + msOf(field(field(task, "result"), "duration"));
  return [{ file: path.relative(root, file), seconds: ms / MS_PER_SECOND }];
}

function tasksIn(blob: string): readonly unknown[] {
  const [, files]: readonly unknown[] = list(parse(readFileSync(blob, "utf8"))) ?? [];
  return list(files) ?? [];
}

function costsIn(blob: string, root: string): readonly FileTiming[] {
  return tasksIn(blob).flatMap((task) => costOf(task, root));
}

function writeCosts({ blobs, file, root }: Costing): void {
  const costs = readdirSync(blobs).flatMap((blob) => costsIn(path.join(blobs, blob), root));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ files: costs }));
}

function timingOf(entry: unknown): readonly FileTiming[] {
  const file = text(field(entry, "file")) ?? "";
  const seconds = field(entry, "seconds");
  if (file === "" || typeof seconds !== "number") {
    return [];
  }
  return [{ file, seconds }];
}

function readCosts(file: string): readonly FileTiming[] {
  if (!existsSync(file)) {
    return [];
  }
  const report = parseJson(readFileSync(file, "utf8"));
  const files = list(field(report, "files")) ?? [];
  return files.flatMap((entry) => timingOf(entry));
}

export { COSTS_REPORT, readCosts, writeCosts };
