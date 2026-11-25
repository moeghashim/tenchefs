import type { Outcome } from "./tools.ts";
import { oxlintFindings } from "./lint-config-findings.ts";
import { parseJson } from "./json.ts";
import { spawnSync } from "node:child_process";

interface Range {
  readonly base: string;
  readonly cwd: string;
  readonly head: string;
}

interface Loosening {
  readonly file: string;
  readonly hunks: readonly string[];
  readonly what: string;
}

interface Diff {
  readonly file: string;
  readonly range: Range;
}

type Guard = (diff: Diff, hunks: readonly string[]) => readonly Loosening[];

const NONE = 0;
const EXIT_SUCCESS = 0;
const HEADER_LINE = 1;
const HUNK_START = "@@";
const ADDED_ENTRY = "+- ";
const REMOVED_ENTRY = "-- ";
const TRAILER = "Lint-approved-by";
const APPROVAL = /^board msg \d+$/u;
const MAX_BUFFER = 67_108_864;
const V1 = "origin/v1";

function git(cwd: string, ...args: readonly string[]): Outcome<string> {
  const ran = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: MAX_BUFFER });
  if (ran.status !== EXIT_SUCCESS) {
    return { ok: false, reason: `git ${args.join(" ")} failed: ${ran.stderr.trim()}` };
  }
  return { ok: true, value: ran.stdout.trim() };
}

function outputOf(outcome: Outcome<string>): string {
  if (outcome.ok) {
    return outcome.value;
  }
  return "";
}

function hunksOf({ file, range }: Diff): readonly string[] {
  return outputOf(git(range.cwd, "diff", range.base, range.head, "--", file))
    .split(/\n(?=@@)/u)
    .filter((chunk) => chunk.startsWith(HUNK_START));
}

function changedLines(hunk: string): readonly string[] {
  return hunk
    .split("\n")
    .slice(HEADER_LINE)
    .filter((line) => line.startsWith("+") || line.startsWith("-"));
}

function hunksNaming(hunks: readonly string[], subject: string): readonly string[] {
  const named = hunks.filter((hunk) => subject !== "" && changedLines(hunk).some((line) => line.includes(subject)));
  if (named.length === NONE) {
    return hunks;
  }
  return named;
}

function contentAt({ file, range }: Diff, revision: string): unknown {
  return parseJson(outputOf(git(range.cwd, "show", `${revision}:${file}`)));
}

function oxlintLoosenings(diff: Diff, hunks: readonly string[]): readonly Loosening[] {
  const sides = { base: contentAt(diff, diff.range.base), head: contentAt(diff, diff.range.head) };
  return oxlintFindings(sides).map((finding) => ({
    file: diff.file,
    hunks: hunksNaming(hunks, finding.subject),
    what: finding.what,
  }));
}

function addsAnEntry(hunk: string): boolean {
  const changed = changedLines(hunk);
  const added = changed.filter((line) => line.startsWith(ADDED_ENTRY)).length;
  return added > changed.filter((line) => line.startsWith(REMOVED_ENTRY)).length;
}

function optOutLoosenings(diff: Diff, hunks: readonly string[]): readonly Loosening[] {
  return hunks
    .filter((hunk) => addsAnEntry(hunk))
    .map((hunk) => ({ file: diff.file, hunks: [hunk], what: "adds an entry" }));
}

function cruiserLoosenings(diff: Diff, hunks: readonly string[]): readonly Loosening[] {
  return [{ file: diff.file, hunks, what: "changes, and any change to it needs approval" }];
}

const GUARDS: readonly (readonly [string, Guard])[] = [
  [".oxlintrc.json", oxlintLoosenings],
  ["docs/lint-opt-outs.md", optOutLoosenings],
  [".dependency-cruiser.cjs", cruiserLoosenings],
];

function approvedIn(range: Range, file: string): boolean {
  const format = `--format=%(trailers:key=${TRAILER},valueonly)`;
  return outputOf(git(range.cwd, "log", "--no-merges", format, `${range.base}..${range.head}`, "--", file))
    .split("\n")
    .some((line) => APPROVAL.test(line.trim()));
}

function loosenings(range: Range): readonly Loosening[] {
  return GUARDS.flatMap(([file, guard]) => {
    const diff = { file, range };
    const hunks = hunksOf(diff);
    if (hunks.length === NONE || approvedIn(range, file)) {
      return [];
    }
    return guard(diff, hunks);
  });
}

function mergeBase({ cwd, head }: { readonly cwd: string; readonly head: string }): Outcome<string> {
  const base = git(cwd, "merge-base", head, V1);
  if (!base.ok) {
    return { ok: false, reason: `Could not find ${head}'s merge base with ${V1}.\n${base.reason}` };
  }
  return base;
}

function unapprovedLoosenings(range: Range): Outcome<readonly Loosening[]> {
  for (const revision of [range.base, range.head]) {
    const found = git(range.cwd, "rev-parse", "--verify", "--quiet", `${revision}^{commit}`);
    if (!found.ok) {
      return { ok: false, reason: `${revision} is not a commit here (a shallow checkout?). Fetch it.` };
    }
  }
  return { ok: true, value: loosenings(range) };
}

function listed(found: readonly Loosening[]): readonly string[] {
  return found.map((loosening) => `${loosening.file}: ${loosening.what}, in the hunk:\n${loosening.hunks.join("\n")}`);
}

interface Verdict {
  readonly ok: boolean;
  readonly report: string;
}

function baseOf(range: Range): Outcome<string> {
  if (range.base !== "") {
    return { ok: true, value: range.base };
  }
  return mergeBase(range);
}

function refusal(range: Range, found: readonly Loosening[]): string {
  return [
    `lint-config: ${range.base}..${range.head} loosens the lint config, which needs Matt's approval:`,
    ...listed(found),
    `Only Matt approves a loosening: the commit that makes it carries the trailer ${TRAILER}: board msg <id>, naming his message.`,
  ].join("\n");
}

function lintConfigCheck(given: Range): Verdict {
  const base = baseOf(given);
  if (!base.ok) {
    return { ok: false, report: `lint-config: ${base.reason}` };
  }
  const range = { ...given, base: base.value };
  const found = unapprovedLoosenings(range);
  if (!found.ok) {
    return { ok: false, report: `lint-config: ${found.reason}` };
  }
  if (found.value.length === NONE) {
    return { ok: true, report: "" };
  }
  return { ok: false, report: refusal(range, found.value) };
}

export type { Loosening };
export { lintConfigCheck, listed, mergeBase, unapprovedLoosenings };
