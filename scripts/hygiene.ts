import { duplicateNumbers, takenOnV1 } from "./lib/adr-numbers.ts";
import { existsSync, readFileSync } from "node:fs";
import { MIGRATION_LISTS } from "./lib/migration-lists.ts";
import type { SpawnSyncReturns } from "node:child_process";
import { adrEdits } from "./lib/adr-append-only.ts";
import { migrationsInserted } from "./lib/migrations-append-only.ts";
import { mixedLocalActions } from "./lib/workflow-actions.ts";
import { spawnSync } from "node:child_process";

const SELF = "scripts/hygiene.ts";
const WIKI = "personal-wiki";

const GIT_OUTPUT = { encoding: "utf8", maxBuffer: 1 << 26 } as const;

const failed = (run: SpawnSyncReturns<string>) => run.error !== undefined || run.status === null || run.status > 1;

const git = (args: readonly string[]) => {
  const run = spawnSync("git", args, GIT_OUTPUT);
  if (failed(run)) {
    console.error(`hygiene: git ${args.join(" ")} failed: ${run.stderr}`);
    process.exit(1);
  }
  return run.stdout.split("\n").filter((line) => line.length > 0);
};

const gitlinks = () =>
  git(["ls-files", "-s"])
    .filter((line) => line.startsWith("160000 "))
    .map((line) => `${line.split("\t")[1] ?? line} is a gitlink (a nested repo or worktree). Unstage it.`);

const workspaceFile = () =>
  existsSync("pnpm-workspace.yaml") && git(["ls-files", "pnpm-workspace.yaml"]).length > 0
    ? []
    : ["pnpm-workspace.yaml is missing from the repo root. Without it, pnpm in a worktree writes to another checkout."];

const VARIABLE = /["'`]([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*)["'`]|\benv\.([A-Z][A-Z0-9_]*)/g;

const configReads = () => {
  const files = git(["ls-files", "app/modules/config"]).filter((file) => !file.includes("/tests/"));
  const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
  return new Set([...source.matchAll(VARIABLE)].map(([, quoted, member]) => quoted ?? member ?? ""));
};

const exampleLines = () =>
  new Set(
    readFileSync(".env.example", "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => line.split("=")[0] ?? line),
  );

const envExample = () => {
  if (!existsSync(".env.example")) {
    return [".env.example is missing."];
  }
  const read = configReads();
  const listed = exampleLines();
  return [
    ...[...read]
      .filter((name) => !listed.has(name))
      .map((name) => `config reads ${name}, but .env.example has no line for it.`),
    ...[...listed]
      .filter((name) => !read.has(name))
      .map((name) => `.env.example lists ${name}, but config never reads it.`),
  ];
};

function readmeSettings(): readonly string[] {
  if (!existsSync("README.md")) {
    return ["README.md is missing."];
  }
  const readme = readFileSync("README.md", "utf8");
  return [...configReads()]
    .filter((name) => !readme.includes(`\n- \`${name}\` (`))
    .map(
      (name) =>
        `config reads ${name}, but the README's Settings section has no line for it, such as "- \`${name}\` (default …): …".`,
    );
}

const wikiCitations = () =>
  git(["grep", "-l", "-F", WIKI, "--", ".", `:!${SELF}`]).map(
    (file) => `${file} names the ${WIKI}. Cite a GitHub issue or PR instead.`,
  );

function adrNumbers(): readonly string[] {
  return duplicateNumbers(git(["ls-files", "docs/adr"]));
}

const STAGED = process.argv.includes("--staged");

function stagedBase(): string {
  const merging = git(["rev-parse", "--quiet", "--verify", "MERGE_HEAD"]);
  const [mergeBase = ""] = git(["merge-base", "origin/v1", "HEAD", ...merging]);
  return mergeBase;
}

function comparedBase(): string {
  if (STAGED) {
    return stagedBase();
  }
  const [mergeBase = ""] = git(["merge-base", "HEAD", "origin/v1"]);
  const [head = ""] = git(["rev-parse", "HEAD"]);
  if (mergeBase === head) {
    return "HEAD~";
  }
  return mergeBase;
}

function adrSides(): readonly string[] {
  if (STAGED) {
    return ["--cached", comparedBase()];
  }
  return [comparedBase()];
}

const ADRS = "docs/adr/*.md";

function originalLines(file: string): readonly string[] {
  const [added = ""] = git(["log", "--reverse", "--diff-filter=A", "--format=%H", "--", file]);
  if (added === "") {
    return [];
  }
  return git(["show", `${added}:${file}`]);
}

function appendOnlyAdrs(): readonly string[] {
  const base = adrSides();
  const changed = git(["diff", "--name-only", "--no-renames", "--diff-filter=M", ...base, "--", ADRS]);
  const diff = git(["diff", "--no-renames", "--unified=0", "--no-color", ...base, "--", ADRS]);
  return adrEdits({
    diff: diff.join("\n"),
    locked: new Set(git(["ls-tree", "--name-only", "origin/v1", "--", "docs/adr/"])),
    originals: new Map(changed.map((file) => [file, originalLines(file)])),
  });
}

function adrsTakenOnV1(): readonly string[] {
  return takenOnV1({
    added: git(["diff", "--name-only", "--no-renames", "--diff-filter=A", ...adrSides(), "--", ADRS]),
    v1: git(["ls-tree", "--name-only", "origin/v1", "--", "docs/adr/"]),
  });
}

function headList(file: string): string {
  if (!existsSync(file)) {
    return "";
  }
  return readFileSync(file, "utf8");
}

function deployedList(tag: string, file: string): readonly string[] {
  if (!git(["ls-tree", "--name-only", tag, "--", file]).includes(file)) {
    return [];
  }
  const shown = spawnSync("git", ["show", `${tag}:${file}`], GIT_OUTPUT);
  if (failed(shown)) {
    return [`git show ${tag}:${file} failed: ${shown.stderr}`];
  }
  return migrationsInserted({ base: shown.stdout, baseName: tag, file, head: headList(file) });
}

function deployedMigrations(): readonly string[] {
  const [tag = ""] = git(["tag", "--list", "deploy/*", "--merged", "HEAD", "--sort=-creatordate"]);
  if (tag === "") {
    return [
      "found no deploy/* tag that HEAD contains, so can't check the migrations list against production's. Run git fetch --tags; the Deploy workflow tags each deployed commit deploy/<short-sha>.",
    ];
  }
  return MIGRATION_LISTS.flatMap((file) => deployedList(tag, file));
}

function workflowActions(): readonly string[] {
  const files = git(["ls-files", ".github/workflows/*.yml"]);
  return mixedLocalActions(files.map((file) => ({ path: file, text: readFileSync(file, "utf8") })));
}

const failures = [
  ...gitlinks(),
  ...workspaceFile(),
  ...envExample(),
  ...readmeSettings(),
  ...wikiCitations(),
  ...adrNumbers(),
  ...appendOnlyAdrs(),
  ...adrsTakenOnV1(),
  ...deployedMigrations(),
  ...workflowActions(),
];
for (const failure of failures) {
  console.error(`hygiene: ${failure}`);
}
process.exitCode = failures.length > 0 ? 1 : 0;
