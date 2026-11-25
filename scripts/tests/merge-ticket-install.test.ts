import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { git, redCi, repo, repos } from "./lib/merge-repos.ts";
import path from "node:path";

const LOCKFILE = "pnpm-lock.yaml";
const NOT_INSTALLED = 0;
const INSTALLED_ONCE = 1;

interface Installs {
  readonly check: readonly string[];
  readonly count: () => number;
  readonly install: readonly string[];
}

function installs(root: string): Installs {
  const installed = path.join(root, "installed");
  return {
    check: ["test", "-f", installed],
    count: (): number => {
      if (!existsSync(installed)) {
        return NOT_INSTALLED;
      }
      return readFileSync(installed, "utf8").length;
    },
    install: ["sh", "-c", `printf x >> ${installed}`],
  };
}

it("installs once, before the check, when the merge brings v1's lockfile change", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { origin, other, root, work } = repos();
  repo(other).push({ [LOCKFILE]: "v1\n" });
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  const { count, ...overrides } = installs(root);

  const merged = repo(work).merge(overrides);

  expect([merged.ok, count(), git(origin, "show", `v1:${LOCKFILE}`)]).toStrictEqual([true, INSTALLED_ONCE, "v1"]);
});

it("doesn't install when the merged lockfile is the ticket's own", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { other, root, work } = repos();
  repo(other).push({ "notes.txt": "v1\n" });
  repo(work).commit("the ticket", { [LOCKFILE]: "ticket\n", "src/c.txt": "c\n" });
  const { count, install } = installs(root);

  const merged = repo(work).merge({ install });

  expect([merged.ok, count()]).toStrictEqual([true, NOT_INSTALLED]);
});

it("installs when continuing a merge that brings v1's lockfile change", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { other, root, work } = repos();
  repo(other).push({ [LOCKFILE]: "v1\n", "notes.txt": "v1\n" });
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  repo(work).merge({});
  repo(work).resolveByHand("both\n");
  const { count, ...overrides } = installs(root);

  const merged = repo(work).continueMerge(overrides);

  expect([merged.ok, count()]).toStrictEqual([true, INSTALLED_ONCE]);
});

it("installs when v1 moved with a lockfile change before --continue", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { other, root, work } = repos();
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  repo(work).merge({ ci: redCi });
  repo(other).push({ [LOCKFILE]: "moved\n" });
  const { count, install } = installs(root);

  const merged = repo(work).continueMerge({ install });

  expect([merged.ok, count()]).toStrictEqual([true, INSTALLED_ONCE]);
});

const TICKET_ADR = { "docs/adr/0002-ticket.md": "# Ticket\n", "notes.txt": "ticket\n" } as const;

function adrsAtHead(work: string): string {
  return git(work, "ls-tree", "-r", "--name-only", "HEAD", "docs/adr/");
}

it("installs before it commits renumbered ADRs, so a failed install leaves no renumbering commit", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { other, work } = repos();
  repo(other).push({ [LOCKFILE]: "v1\n", "docs/adr/0002-v1.md": "# v1\n" });
  repo(work).commit("the ticket", TICKET_ADR);

  const merged = repo(work).merge({ install: ["false"] });

  expect([merged.ok, adrsAtHead(work)]).toStrictEqual([
    false,
    "docs/adr/0001-base.md\ndocs/adr/0002-ticket.md\ndocs/adr/0002-v1.md",
  ]);
});

it("installs before it renumbers ADRs again when v1 moved before --continue", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { other, work } = repos();
  repo(other).push({ "docs/adr/0002-v1.md": "# v1\n" });
  repo(work).commit("the ticket", TICKET_ADR);
  repo(work).merge({ ci: redCi });
  repo(other).push({ [LOCKFILE]: "moved\n", "docs/adr/0003-other.md": "# Other\n" });

  const merged = repo(work).continueMerge({ install: ["sh", "-c", `! grep -q moved ${LOCKFILE}`] });

  expect([merged.ok, adrsAtHead(work)]).toStrictEqual([
    false,
    "docs/adr/0001-base.md\ndocs/adr/0002-v1.md\ndocs/adr/0003-other.md\ndocs/adr/0003-ticket.md",
  ]);
});
