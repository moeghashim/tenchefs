import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import type { Outcome } from "./tools.ts";
import { isUserFacing } from "./release-go.ts";
import path from "node:path";

type Command = (args: readonly string[]) => Outcome<string>;

interface Adding {
  readonly directory: string;
  readonly git: Command;
}

interface Since {
  readonly changed: readonly string[];
  readonly from: string;
  readonly subjects: readonly string[];
}

interface Range {
  readonly changed: readonly string[];
  readonly from: string;
  readonly subjects: readonly string[];
}

const PACKAGE = "@ai-hero/cookout";
const FILE = "unreleased-work.md";
const FIRST_COMMIT = "the first commit";
const FENCE = "---\n";
const VERSION_PACKAGES = String.raw`^Version Packages( \(#[0-9]+\))?$`;
const NAMES_PACKAGE = /^\s*["']?@ai-hero\/cookout["']?\s*:/mu;

function linesOf(output: string): readonly string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function releasesPackage(content: string): boolean {
  if (!content.startsWith(FENCE)) {
    return false;
  }
  const end = content.indexOf(FENCE.trim(), FENCE.length);
  return NAMES_PACKAGE.test(content.slice(FENCE.length, end));
}

function pendingReleasesPackage(directory: string): boolean {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .some((name) => releasesPackage(readFileSync(path.join(directory, name), "utf8")));
}

function rangeFrom(base: string): Range {
  if (base === "") {
    return { changed: ["ls-files"], from: FIRST_COMMIT, subjects: ["HEAD"] };
  }
  return { changed: ["diff", "--name-only", base, "HEAD"], from: base, subjects: [`${base}..HEAD`] };
}

function inRange(git: Command, range: Range): Outcome<Since> {
  const changed = git(range.changed);
  if (!changed.ok) {
    return changed;
  }
  const subjects = git(["log", "--first-parent", "--format=%s", ...range.subjects]);
  if (!subjects.ok) {
    return subjects;
  }
  return { ok: true, value: { changed: linesOf(changed.value), from: range.from, subjects: linesOf(subjects.value) } };
}

function newestCommit(git: Command, args: readonly string[]): Outcome<string> {
  const found = git(["log", "-1", "--format=%H", ...args]);
  if (!found.ok) {
    return found;
  }
  const [commit = ""] = linesOf(found.value);
  return { ok: true, value: commit };
}

function releasedAt(git: Command): Outcome<string> {
  const merged = newestCommit(git, ["--first-parent", "-E", `--grep=${VERSION_PACKAGES}`, "HEAD"]);
  if (!merged.ok || merged.value !== "") {
    return merged;
  }
  return newestCommit(git, ["-G", '"version":', "--", "package.json"]);
}

function landedSince(git: Command): Outcome<Since> {
  const base = releasedAt(git);
  if (!base.ok) {
    return base;
  }
  return inRange(git, rangeFrom(base.value));
}

function changesetOf(subjects: readonly string[]): string {
  return [
    "---",
    `"${PACKAGE}": patch`,
    "---",
    "",
    "Work that landed without a changeset:",
    "",
    ...subjects.map((subject) => `- ${subject}`),
    "",
  ].join("\n");
}

function added({ directory }: Adding, { changed, from, subjects }: Since): string {
  const shipping = changed.find((file) => isUserFacing(file));
  if (typeof shipping !== "string") {
    return `added nothing: no shipping code landed since ${from}`;
  }
  if (pendingReleasesPackage(directory)) {
    return `added nothing: a pending changeset already releases ${PACKAGE}`;
  }
  writeFileSync(path.join(directory, FILE), changesetOf(subjects));
  return `added .changeset/${FILE}: ${shipping} landed since ${from} with no changeset, so this releases a patch`;
}

function addUnreleasedChangeset(adding: Adding): Outcome<string> {
  const since = landedSince(adding.git);
  if (!since.ok) {
    return since;
  }
  return { ok: true, value: added(adding, since.value) };
}

export { addUnreleasedChangeset };
