import { ATTEMPTS, TICKET, git, repo, repos } from "./lib/merge-repos.ts";
import { expect, it } from "vitest";
import type { Merged } from "../lib/merge-ticket.ts";
import { fakeCi } from "./lib/fake-ci.ts";
import path from "node:path";
import { writeFileSync } from "node:fs";

const MERGE_BRANCH = `merge-ticket-${TICKET}`;
const TITLE = `Merge ticket-${TICKET}: Add the c table (#${TICKET})`;
const FIRST_RUN = 1;
const TWO_RUNS = 2;
const SECOND = 1;
const EXECUTABLE = 0o755;

function reasonOf(merged: Merged): string {
  if (merged.ok) {
    return "merged";
  }
  return merged.reason;
}

function v1Updates(origin: string): readonly string[] {
  return git(origin, "reflog", "--format=%H", "v1").split("\n");
}

function logAllRefUpdates(origin: string): void {
  git(origin, "config", "core.logAllRefUpdates", "always");
}

function ticketRepos(): ReturnType<typeof repos> {
  const repositories = repos();
  logAllRefUpdates(repositories.origin);
  repo(repositories.work).commit("the ticket", { "notes.txt": "ticket\n" });
  return repositories;
}

function logged(): { readonly log: (line: string) => void; readonly logs: readonly string[] } {
  const logs: string[] = [];
  return {
    log: (line): void => {
      logs.push(line);
    },
    logs,
  };
}

it("merges again when v1 moves while it waits for CI, waits for the new commit's run, and fast-forwards v1 to it", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = ticketRepos();
  const { ci, green } = fakeCi({ moveV1: (run) => run === FIRST_RUN, origin, other });
  const { log, logs } = logged();

  const merged = repo(work).merge({ ci, log });

  const sha = git(origin, "rev-parse", "v1");

  expect([merged, green.length, green.at(SECOND), git(origin, "log", "-1", "--format=%s", "v1^1")]).toStrictEqual([
    { ok: true, sha },
    TWO_RUNS,
    sha,
    "moved",
  ]);
  expect(v1Updates(origin).filter((update) => update !== git(origin, "rev-parse", "v1^1"))).toStrictEqual([sha]);
  expect(logs).toContain(
    `v1 moved before the push. Round 2 of ${ATTEMPTS}: merging the new origin/v1 into ${MERGE_BRANCH}`,
  );
});

it("never forces v1: when v1 keeps moving during CI, v1 keeps every move and never gets the merge", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = ticketRepos();
  const { ci, green } = fakeCi({ moveV1: () => true, origin, other });

  const merged = repo(work).merge({ ci });

  const moves = git(origin, "log", "--format=%s", "v1").split("\n");

  expect([
    merged.ok,
    reasonOf(merged),
    green.length,
    moves.filter((subject) => subject === "moved").length,
  ]).toStrictEqual([
    false,
    `v1 kept moving: gave up after ${ATTEMPTS} rounds. Nothing was pushed to v1.`,
    ATTEMPTS,
    ATTEMPTS,
  ]);
  expect(v1Updates(origin).some((update) => green.includes(update))).toBe(false);
  expect(moves).not.toContain(TITLE);
});

function refuseV1(origin: string): void {
  const hook = '#!/bin/sh\nwhile read old new ref; do [ "$ref" = refs/heads/v1 ] && exit 1; done\nexit 0\n';
  writeFileSync(path.join(origin, "hooks", "pre-receive"), hook, { mode: EXECUTABLE });
}

it("stops, naming the push, when origin refuses the fast-forward though v1 has not moved", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  const before = git(origin, "rev-parse", "v1");
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  refuseV1(origin);
  const { ci } = fakeCi({ origin, other });

  const merged = repo(work).merge({ ci });

  expect([merged.ok, git(origin, "rev-parse", "v1"), reasonOf(merged)]).toStrictEqual([
    false,
    before,
    expect.stringMatching(/^git push origin [0-9a-f]{40}:refs\/heads\/v1 failed, though v1 has not moved\./u),
  ]);
});
