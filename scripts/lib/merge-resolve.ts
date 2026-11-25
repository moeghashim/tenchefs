import type { Command, Ran, Step, Stopped } from "./merge-steps.ts";
import { DONE, RERERE, firstStop, git, lines, run, stepOf, stop, tail } from "./merge-steps.ts";
import type { FirstSide, HunkResolve } from "./conflicts.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { messageOf } from "./merge-branch.ts";
import path from "node:path";
import { remergeMigrations } from "./merge-migrations.ts";
import { renumberOpenMerge } from "./merge-adrs.ts";
import { resolveHunks } from "./conflicts.ts";

interface HunkRule {
  readonly file: string;
  readonly resolve: HunkResolve;
}

interface RegenerateRule {
  readonly command: Command;
  readonly files: string;
}

interface MergeRules {
  readonly adrs: string;
  readonly appendOnly: readonly string[];
  readonly hunks: readonly HunkRule[];
  readonly regenerate: readonly RegenerateRule[];
}

interface ResolveOptions {
  readonly approved?: string;
  readonly cwd: string;
  readonly log: (line: string) => void;
  readonly rules: MergeRules;
  readonly ticket: number;
  readonly title: string;
}

const NONE = 0;

function failed(command: Command, ran: Ran, after: string): Stopped {
  return stop(`${command.join(" ")} failed; nothing was pushed.${after}\n${tail(ran.output)}`);
}

function resolvedByHunks(options: ResolveOptions, file: string, first: FirstSide): boolean {
  const rules = options.rules.hunks.filter((candidate) => candidate.file === file);
  const filePath = path.join(options.cwd, file);
  return rules.some((rule) => {
    const resolved = resolveHunks({ first, resolve: rule.resolve, source: readFileSync(filePath, "utf8") });
    if (resolved.ok) {
      writeFileSync(filePath, resolved.text);
    }
    return resolved.ok && git(options, "add", "--", file).ok;
  });
}

function isGenerated(options: ResolveOptions, file: string): boolean {
  return options.rules.regenerate.some((rule) => new RegExp(rule.files, "u").test(file));
}

function regenerate(options: ResolveOptions, generated: readonly string[]): Step {
  for (const file of generated) {
    git(options, "checkout", "--ours", "--", file);
  }
  const rules = options.rules.regenerate.filter((rule) =>
    generated.some((file) => new RegExp(rule.files, "u").test(file)),
  );
  for (const rule of rules) {
    options.log(`Regenerating with ${rule.command.join(" ")}`);
    const ran = run(options.cwd, ...rule.command);
    if (!ran.ok) {
      return failed(rule.command, ran, "");
    }
  }
  return DONE;
}

function unresolvable(options: ResolveOptions, left: readonly string[]): Stopped {
  const listed = left.map((file) => `  ${file}`).join("\n");
  return stop(
    `ticket-${options.ticket} conflicts with v1 in files that are not generated, a migration number or the coverage floor:\n${listed}\nNothing was pushed. The merge is in progress on merge-ticket-${options.ticket}: resolve it by hand and commit, then run pnpm merge-ticket ${options.ticket} --continue; or run git merge --abort.`,
    ...left,
  );
}

function resolveConflicts(options: ResolveOptions, conflicted: readonly string[], first: FirstSide): Step {
  const generated = conflicted.filter((file) => isGenerated(options, file));
  const left = conflicted.filter((file) => !generated.includes(file) && !resolvedByHunks(options, file, first));
  if (left.length > NONE) {
    return unresolvable(options, left);
  }
  const regenerated = regenerate(options, generated);
  if (regenerated.kind === "stopped") {
    return regenerated;
  }
  const committed = firstStop([
    (): Step => stepOf({ ran: git(options, "add", "-u"), what: "git add -u" }),
    (): Step => stepOf({ ran: git(options, "commit", "-q", "--no-edit"), what: "Committing the resolved merge" }),
  ]);
  return committed;
}

function merge(options: ResolveOptions, into: string, first: FirstSide): Step {
  const merged = git(
    options,
    ...RERERE,
    "-c",
    "merge.conflictStyle=diff3",
    "merge",
    "-q",
    "--no-ff",
    into,
    "-m",
    messageOf(options),
  );
  if (merged.ok) {
    return DONE;
  }
  const appended = options.rules.hunks.filter((rule) => rule.resolve === "append").map((rule) => rule.file);
  const unmerged = remergeMigrations({ cwd: options.cwd, files: appended, first });
  const conflicted = [
    ...new Set([...lines(git(options, "diff", "--name-only", "--diff-filter=U").output), ...unmerged]),
  ];
  if (conflicted.length === NONE && !git(options, "rev-parse", "-q", "--verify", "MERGE_HEAD").ok) {
    return stop(`git merge failed.\n${tail(merged.output)}`);
  }
  options.log(`Resolving conflicts in ${conflicted.join(", ")}`);
  return firstStop([
    (): Step => renumberOpenMerge({ adrs: options.rules.adrs, cwd: options.cwd, log: options.log }),
    (): Step => resolveConflicts(options, conflicted, first),
  ]);
}

function failedStep({
  after,
  command,
  ran,
}: {
  readonly after: string;
  readonly command: Command;
  readonly ran: Ran;
}): Stopped {
  return failed(command, ran, after);
}

function regenerateFiles({
  files,
  options,
}: {
  readonly files: readonly string[];
  readonly options: ResolveOptions;
}): Step {
  return regenerate(
    options,
    files.filter((file) => isGenerated(options, file)),
  );
}

function mergeInto({
  first,
  into,
  options,
}: {
  readonly first: FirstSide;
  readonly into: string;
  readonly options: ResolveOptions;
}): Step {
  return merge(options, into, first);
}

export type { MergeRules };
export { failedStep, mergeInto, regenerateFiles };
