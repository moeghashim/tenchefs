import { BRANCH, TICKET, git, migrations, redCi, repo, repos } from "./lib/merge-repos.ts";
import { expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ADRS = {
  ticket: {
    "docs/adr/0002-ticket.md": "# Ticket\n\nSee ADR 0002.\n",
    "notes.txt": "ticket: ADR 0002, adr/0002-ticket.md\n",
    "src/tests/numbers.test.ts": "ADR 0002\n",
  },
  v1: { "docs/adr/0002-v1.md": "# v1\n", "v1.txt": "v1: ADR 0002\n" },
} as const;
const RENUMBERED = ["docs/adr/0001-base.md", "docs/adr/0002-v1.md", "docs/adr/0003-ticket.md"] as const;

const REFUSE_DUPLICATE_NUMBERS = [
  "#!/bin/sh",
  String.raw`test -z "$(git ls-files docs/adr | sed 's|docs/adr/\([0-9]*\)-.*|\1|' | sort | uniq -d)"`,
  "",
].join("\n");

function refuseDuplicateNumbersOnCommit(work: string): void {
  writeFileSync(path.join(work, ".git/hooks/pre-commit"), REFUSE_DUPLICATE_NUMBERS, { mode: 0o755 });
}

function adrsOn(origin: string): readonly string[] {
  return git(origin, "ls-tree", "--name-only", "v1", "docs/adr/").split("\n");
}

it("renumbers a ticket's new ADR past v1's highest, and the references the ticket added outside tests", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  repo(other).push(ADRS.v1);
  repo(work).commit("the ticket", ADRS.ticket);

  const merged = repo(work).merge({});

  expect(merged).toStrictEqual({ ok: true, sha: git(origin, "rev-parse", "v1") });
  expect([
    adrsOn(origin),
    git(origin, "show", "v1:docs/adr/0003-ticket.md"),
    git(origin, "show", "v1:notes.txt"),
    git(origin, "show", "v1:v1.txt"),
    git(origin, "show", "v1:src/tests/numbers.test.ts"),
    git(origin, "log", "-1", "--format=%s", "v1"),
  ]).toStrictEqual([
    RENUMBERED,
    "# Ticket\n\nSee ADR 0003.",
    "ticket: ADR 0003, adr/0003-ticket.md",
    "v1: ADR 0002",
    "ADR 0002",
    `Merge ${BRANCH}: Add the c table (#${TICKET})`,
  ]);
});

it("renumbers an ADR the ticket renamed onto a number v1 has since taken", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  repo(other).push({ "docs/adr/0002-v1.md": "# v1\n" });
  git(work, "mv", "docs/adr/0001-base.md", "docs/adr/0002-base.md");
  repo(work).commit("the ticket", {});

  const merged = repo(work).merge({});

  expect(merged).toStrictEqual({ ok: true, sha: git(origin, "rev-parse", "v1") });
  expect(adrsOn(origin)).toStrictEqual(["docs/adr/0002-v1.md", "docs/adr/0003-base.md"]);
});

it("renumbers a ticket's ADR again when v1 takes its new number before --continue", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  repo(other).push(ADRS.v1);
  repo(work).commit("the ticket", ADRS.ticket);
  repo(work).merge({ ci: redCi });
  repo(other).push({ "docs/adr/0003-other.md": "# Other\n" });

  const merged = repo(work).continueMerge({});

  expect(merged).toStrictEqual({ ok: true, sha: git(origin, "rev-parse", "v1") });
  expect([
    adrsOn(origin),
    git(origin, "show", "v1:docs/adr/0004-ticket.md"),
    git(origin, "show", "v1:notes.txt"),
  ]).toStrictEqual([
    ["docs/adr/0001-base.md", "docs/adr/0002-v1.md", "docs/adr/0003-other.md", "docs/adr/0004-ticket.md"],
    "# Ticket\n\nSee ADR 0004.",
    "ticket: ADR 0004, adr/0004-ticket.md",
  ]);
});

it("renumbers a ticket's new ADR in the open merge when it stops on a conflict, so the hand-written commit passes", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  repo(other).push({ ...ADRS.v1, "notes.txt": "v1\n" });
  repo(work).commit("the ticket", { ...ADRS.ticket, "other.txt": "ticket: see adr/0002-ticket.md\n" });
  refuseDuplicateNumbersOnCommit(work);

  const stopped = repo(work).merge({});
  const open = [
    git(work, "ls-files", "docs/adr"),
    git(work, "show", ":other.txt"),
    git(work, "show", ":docs/adr/0003-ticket.md"),
    readFileSync(path.join(work, "notes.txt"), "utf8").includes("ticket: ADR 0003, adr/0003-ticket.md"),
  ];
  repo(work).resolveByHand("ticket: ADR 0003, adr/0003-ticket.md\n");
  const merged = repo(work).continueMerge({});

  expect([stopped.ok, open, merged]).toStrictEqual([
    false,
    [RENUMBERED.join("\n"), "ticket: see adr/0003-ticket.md", "# Ticket\n\nSee ADR 0003.", true],
    { ok: true, sha: git(origin, "rev-parse", "v1") },
  ]);
});

it("renumbers a ticket's new ADR before it commits a merge whose conflicts it resolves itself", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  repo(other).push({ ...ADRS.v1, "migrations.ts": migrations("a", "b") });
  repo(work).commit("the ticket", { ...ADRS.ticket, "migrations.ts": migrations("a", "c") });
  refuseDuplicateNumbersOnCommit(work);

  const merged = repo(work).merge({});

  expect([merged, adrsOn(origin), git(origin, "show", "v1:notes.txt")]).toStrictEqual([
    { ok: true, sha: git(origin, "rev-parse", "v1") },
    RENUMBERED,
    "ticket: ADR 0003, adr/0003-ticket.md",
  ]);
});
