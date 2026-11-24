import { changesetMissing, packageShips } from "./lib/changesets.ts";
import { existsSync, readFileSync } from "node:fs";
import type { Change } from "./lib/changesets.ts";
import { MIGRATION_LISTS } from "./lib/migration-lists.ts";
import type { SpawnSyncReturns } from "node:child_process";
import { adrEdits } from "./lib/adr-append-only.ts";
import { duplicateNumbers } from "./lib/adr-numbers.ts";
import { migrationsInserted } from "./lib/migrations-append-only.ts";
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

const BASE_FLAG = "--base=";

function givenBase(): string {
  const flag = process.argv.find((arg) => arg.startsWith(BASE_FLAG)) ?? BASE_FLAG;
  return flag.slice(BASE_FLAG.length);
}

function comparedBase(): string {
  const given = givenBase();
  if (given !== "") {
    return given;
  }
  const [mergeBase = ""] = git(["merge-base", "HEAD", "origin/v1"]);
  const [head = ""] = git(["rev-parse", "HEAD"]);
  if (mergeBase === head) {
    return "HEAD~";
  }
  return mergeBase;
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
  const base = comparedBase();
  const changed = git(["diff", "--name-only", "--no-renames", "--diff-filter=M", base, "--", ADRS]);
  const diff = git(["diff", "--no-renames", "--unified=0", "--no-color", base, "--", ADRS]);
  return adrEdits({
    diff: diff.join("\n"),
    locked: new Set(git(["ls-tree", "--name-only", "origin/v1", "--", "docs/adr/"])),
    originals: new Map(changed.map((file) => [file, originalLines(file)])),
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

const MERGE_PARENTS_LINE = 3;

function isMergeOnV1(): boolean {
  const [mergeBase = ""] = git(["merge-base", "HEAD", "origin/v1"]);
  const headAndParents = git(["rev-list", "--parents", "--max-count=1", "HEAD"]).join(" ").split(" ");
  const [head] = headAndParents;
  return head === mergeBase && headAndParents.length >= MERGE_PARENTS_LINE;
}

function change(line: string): Change {
  const [status = "", file = ""] = line.split("\t");
  return { file, status };
}

async function changesets(): Promise<readonly string[]> {
  if (isMergeOnV1()) {
    return [];
  }
  const changes = git(["diff", "--name-status", "--no-renames", comparedBase(), "HEAD"]).map((line) => change(line));
  return changesetMissing({ changes, ships: await packageShips() });
}

const failures = [
  ...gitlinks(),
  ...workspaceFile(),
  ...envExample(),
  ...readmeSettings(),
  ...wikiCitations(),
  ...adrNumbers(),
  ...appendOnlyAdrs(),
  ...deployedMigrations(),
  ...(await changesets()),
];
for (const failure of failures) {
  console.error(`hygiene: ${failure}`);
}
process.exitCode = failures.length > 0 ? 1 : 0;
