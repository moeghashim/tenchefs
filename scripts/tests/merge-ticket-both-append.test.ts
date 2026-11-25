import { BRANCH, git, repo, repos } from "./lib/merge-repos.ts";
import { expect, it } from "vitest";
import { MIGRATION_LISTS } from "../lib/migration-lists.ts";
import type { Merged } from "../lib/merge-ticket.ts";
import type { Repos } from "./lib/merge-repos.ts";
import { mergeRules } from "../lib/merge-rules.ts";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const [SQLITE = "", POSTGRES = ""] = MIGRATION_LISTS;

function list(name: string, entries: readonly string[]): string {
  const imports = entries.map((entry) => `import { ${entry} } from "./${entry.toLowerCase()}.ts";\n`).join("");
  const listed = entries.map((entry) => `  ${entry},\n`).join("");
  return `${imports}\nconst ${name}: readonly unknown[] = [\n${listed}];`;
}

function sqlite(...entries: readonly string[]): string {
  return list("migrations", entries);
}

function postgres(...entries: readonly string[]): string {
  return list(
    "postgresMigrations",
    entries.map((entry) => `POSTGRES_${entry}`),
  );
}

function lists(...entries: readonly string[]): Readonly<Record<string, string>> {
  return { [POSTGRES]: `${postgres(...entries)}\n`, [SQLITE]: `${sqlite(...entries)}\n` };
}

function onV1WithBase(): Repos {
  const cloned = repos();
  repo(cloned.other).push(lists("BASE"));
  git(cloned.work, "fetch", "-q", "origin");
  git(cloned.work, "merge", "-q", "--ff-only", "origin/v1");
  return cloned;
}

function onV1(origin: string): readonly string[] {
  return [git(origin, "show", `v1:${SQLITE}`), git(origin, "show", `v1:${POSTGRES}`)];
}

function stopTwiceResolvingByHand({ other, work }: Pick<Repos, "other" | "work">): readonly boolean[] {
  const stopped = repo(work).merge({ rules: mergeRules });
  repo(work).resolveByHand("both\n");
  repo(other).push({ ...lists("BASE", "ORDER", "SEARCH"), "notes.txt": "moved\n" });
  const stoppedAgain = repo(work).continueMerge({ rules: mergeRules });
  repo(work).resolveByHand("all\n");
  return [stopped.ok, stoppedAgain.ok];
}

it("keeps v1's whole migration lists and appends the ticket's entries after them when both sides append one", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = onV1WithBase();
  repo(work).commit("the ticket", lists("BASE", "ATTACHMENTS"));
  repo(other).push(lists("BASE", "SEARCH"));

  const merged = repo(work).merge({ rules: mergeRules });

  expect(merged).toStrictEqual({ ok: true, sha: git(origin, "rev-parse", "v1") });
  expect(onV1(origin)).toStrictEqual([
    sqlite("BASE", "SEARCH", "ATTACHMENTS"),
    postgres("BASE", "SEARCH", "ATTACHMENTS"),
  ]);
});

it("keeps v1's migrations first when v1 appends one while a merge resolved by hand waits to continue", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = onV1WithBase();
  repo(work).commit("the ticket", { ...lists("BASE", "ATTACHMENTS"), "notes.txt": "ticket\n" });
  repo(other).push({ ...lists("BASE", "ORDER"), "notes.txt": "v1\n" });
  const stops = stopTwiceResolvingByHand({ other, work });

  const merged = repo(work).continueMerge({ rules: mergeRules });

  expect(stops).toStrictEqual([false, false]);
  expect(merged).toStrictEqual({ ok: true, sha: git(origin, "rev-parse", "v1") });
  expect(onV1(origin)).toStrictEqual([
    sqlite("BASE", "ORDER", "SEARCH", "ATTACHMENTS"),
    postgres("BASE", "ORDER", "SEARCH", "ATTACHMENTS"),
  ]);
});

function refusedFiles(merged: Merged): readonly string[] {
  if (merged.ok) {
    return [];
  }
  return merged.files;
}

function stopOnNotes({ other, work }: Pick<Repos, "other" | "work">): boolean {
  repo(work).commit("the ticket", { ...lists("BASE", "ATTACHMENTS"), "notes.txt": "ticket\n" });
  repo(other).push({ "notes.txt": "v1\n" });
  return repo(work).merge({ rules: mergeRules }).ok;
}

it("catches up with a v1 that gained a migration after the merge stopped, without reporting it dropped", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = onV1WithBase();
  const stopped = stopOnNotes({ other, work });
  repo(work).resolveByHand("both\n");
  repo(other).push(lists("BASE", "ORDER"));
  git(work, "fetch", "-q", "origin");

  const merged = repo(work).continueMerge({ rules: mergeRules });

  expect([stopped, merged.ok]).toStrictEqual([false, true]);
  expect(onV1(origin)).toStrictEqual([
    sqlite("BASE", "ORDER", "ATTACHMENTS"),
    postgres("BASE", "ORDER", "ATTACHMENTS"),
  ]);
});

it("refuses to continue a merge whose resolution by hand drops v1's migration", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { origin, other, work } = onV1WithBase();
  repo(other).push(lists("BASE", "ORDER"));
  const stopped = stopOnNotes({ other, work });
  repo(work).resolveByHand("both\n", lists("BASE", "ATTACHMENTS"));
  const before = git(origin, "rev-parse", "v1");

  const merged = repo(work).continueMerge({ rules: mergeRules });

  expect([stopped, merged.ok, git(origin, "rev-parse", "v1")]).toStrictEqual([false, false, before]);
  expect(refusedFiles(merged)).toStrictEqual([POSTGRES, SQLITE].toSorted());
});

function plantWrongResolution(work: string, wrong: Readonly<Record<string, string>>): void {
  git(work, "fetch", "-q", "origin");
  git(work, "checkout", "-q", "-b", "plant", "origin/v1");
  spawnSync("git", ["-c", "rerere.enabled=true", "-c", "merge.conflictStyle=diff3", "merge", "-q", BRANCH], {
    cwd: work,
  });
  for (const [file, content] of Object.entries(wrong)) {
    writeFileSync(path.join(work, file), content);
  }
  git(work, "-c", "rerere.enabled=true", "rerere");
  git(work, "merge", "--abort");
  git(work, "checkout", "-q", BRANCH);
  git(work, "branch", "-q", "-D", "plant");
}

it("ignores a recorded rerere resolution of a migrations list that drops v1's entry", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { origin, other, work } = onV1WithBase();
  repo(work).commit("the ticket", lists("BASE", "ATTACHMENTS"));
  repo(other).push(lists("BASE", "SEARCH"));
  plantWrongResolution(work, lists("BASE", "ATTACHMENTS"));

  const merged = repo(work).merge({ rules: mergeRules });

  expect(merged).toStrictEqual({ ok: true, sha: git(origin, "rev-parse", "v1") });
  expect(onV1(origin)).toStrictEqual([
    sqlite("BASE", "SEARCH", "ATTACHMENTS"),
    postgres("BASE", "SEARCH", "ATTACHMENTS"),
  ]);
});

it("merges a migrations list both sides changed apart cleanly while another file stops the merge", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { other, work } = onV1WithBase();
  repo(work).commit("the ticket", { ...lists("BASE", "ATTACHMENTS"), "notes.txt": "ticket\n" });
  repo(other).push({ [SQLITE]: `// v1\n${sqlite("BASE")}\n`, "notes.txt": "v1\n" });

  const stopped = repo(work).merge({ rules: mergeRules });

  expect([stopped.ok, git(work, "show", `:${SQLITE}`)]).toStrictEqual([
    false,
    `// v1\n${sqlite("BASE", "ATTACHMENTS")}`,
  ]);
});
