import { field, parseJson, text } from "../../lib/json.ts";
import path from "node:path";
import { readFileSync } from "node:fs";

const PLAIN_FLOOR = /^>=\s*(?<version>\d+(?:\.\d+){0,2})$/u;
const BEYOND_PATCH = /^(?<patch>\d+\.\d+\.\d+).*$/u;
const BEYOND_MINOR = /^(?<minor>\d+\.\d+)\..*$/u;
const VERSIONS = new Intl.Collator("en", { numeric: true });
const OLDER = -1;

function manifest(dir: string): unknown {
  return parseJson(readFileSync(path.join(dir, "package.json"), "utf8"));
}

function nodeRange(dir: string): string {
  const engines = field(manifest(dir), "engines");
  return text(field(engines, "node")) ?? "";
}

function dependencyRange(dir: string, name: string): string {
  return nodeRange(path.join(dir, "node_modules", name));
}

function floorVersion(range: string): string {
  const trimmed = range.trim();
  if (!PLAIN_FLOOR.test(trimmed)) {
    throw new Error(`not a plain ">=" Node range: "${range}"`);
  }
  return trimmed.replace(PLAIN_FLOOR, "$<version>.0.0").replace(BEYOND_PATCH, "$<patch>");
}

function covers(declared: string, needs: string): boolean {
  return needs === "" || Math.sign(VERSIONS.compare(floorVersion(declared), floorVersion(needs))) !== OLDER;
}

export function nodeFloor(dir: string): string {
  return floorVersion(nodeRange(dir)).replace(BEYOND_MINOR, "$<minor>");
}

export function dependenciesAboveNodeFloor(dir: string): readonly string[] {
  const declared = nodeRange(dir);
  const dependencies = field(manifest(dir), "dependencies");
  if (typeof dependencies !== "object" || dependencies === null) {
    return [];
  }
  return Object.keys(dependencies)
    .filter((name) => !covers(declared, dependencyRange(dir, name)))
    .map((name) => `${name} needs ${dependencyRange(dir, name)}`);
}
