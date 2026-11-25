import {
  BRANCH,
  TICKET,
  attemptOf,
  fakePullRequests,
  git,
  pushedBranch,
  repo,
  repos,
  resolvedByHand,
} from "./lib/merge-repos.ts";
import { expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import type { Merged } from "../lib/merge-ticket.ts";
import { fakeCi } from "./lib/fake-ci.ts";
import path from "node:path";

const MERGE_BRANCH = `merge-ticket-${TICKET}`;
const TITLE = `Merge ${BRANCH}: Add the c table (#${TICKET})`;
const FIRST_RUN = 1;
const TWO_RUNS = 2;
const FIRST_FIELD = 0;
const EXECUTABLE = 0o755;
const CREATED = /^0+ \S+ refs\/heads\/merge-ticket-/u;
const LAST = -1;

function reasonOf(merged: Merged): string {
  if (merged.ok) {
    return "merged";
  }
  return merged.reason;
}

function remoteBranches(origin: string): string {
  return git(origin, "branch", "--list", "--format=%(refname:short)");
}

it("pushes merge-ticket-N, waits for its green Check run, and fast-forwards v1 to that exact commit", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  const { ci, green, watched } = fakeCi({ origin, other });
  const prs = fakePullRequests();

  const merged = repo(work).merge({ ci, pullRequest: prs.pullRequest });

  const head = git(origin, "rev-parse", "v1");

  expect([merged, green, watched, prs.landings, remoteBranches(origin)]).toStrictEqual([
    { ok: true, sha: head },
    [head],
    [`${attemptOf(head)} ${head} ${head}`],
    [{ branch: attemptOf(head), sha: head, title: TITLE }],
    "v1",
  ]);
  expect([git(origin, "log", "-1", "--format=%s", "v1"), git(origin, "rev-parse", "v1^2")]).toStrictEqual([
    TITLE,
    git(work, "rev-parse", BRANCH),
  ]);
});

it("returns the merge once v1 is fast-forwarded, watching no Check run but merge-ticket-N's", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  const { ci, watched } = fakeCi({ origin, other });

  const merged = repo(work).merge({ ci });

  expect([merged.ok, watched.map((each) => each.split(" ").at(FIRST_FIELD))]).toStrictEqual([
    true,
    [attemptOf(git(origin, "rev-parse", "v1"))],
  ]);
});

it("stops on a red Check run of merge-ticket-N, pushes nothing to v1 and keeps the branch for a rerun", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  const before = git(origin, "rev-parse", "v1");
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  const { ci } = fakeCi({ origin, other, red: () => true });

  const merged = repo(work).merge({ ci });

  const red = git(origin, "rev-parse", pushedBranch(origin));

  expect([merged.ok, git(origin, "rev-parse", "v1"), remoteBranches(origin)]).toStrictEqual([
    false,
    before,
    `${attemptOf(red)}
v1`,
  ]);
  expect(reasonOf(merged)).toContain(
    `tests 1/2 (failure).\nThat Check run was on ${attemptOf(red)} at ${red}.\nNothing was pushed to v1. The merge is on ${MERGE_BRANCH}`,
  );
});

function recordPushes(origin: string): () => readonly string[] {
  const pushes = path.join(origin, "pushes.log");
  writeFileSync(pushes, "");
  writeFileSync(path.join(origin, "hooks", "post-receive"), `#!/bin/sh\ncat >> "${pushes}"\n`, { mode: EXECUTABLE });
  return (): readonly string[] => readFileSync(pushes, "utf8").split("\n");
}

function created(pushes: readonly string[]): readonly string[] {
  return pushes.filter((line) => CREATED.test(line));
}

it("pushes, watches and fast-forwards merge-ticket-N again when continuing a merge resolved by hand", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = resolvedByHand();
  const { ci, green } = fakeCi({ origin, other });
  const prs = fakePullRequests();

  const merged = repo(work).continueMerge({ ci, pullRequest: prs.pullRequest });

  const head = git(origin, "rev-parse", "v1");

  expect([merged, green, prs.landings, remoteBranches(origin)]).toStrictEqual([
    { ok: true, sha: head },
    [head],
    [{ branch: attemptOf(head), sha: head, title: TITLE }],
    "v1",
  ]);
});

function pushedResolution(): ReturnType<typeof repos> & { readonly pushes: () => readonly string[] } {
  const repositories = resolvedByHand();
  const { origin, work } = repositories;
  const pushes = recordPushes(origin);
  git(work, "push", "-q", "origin", `HEAD:refs/heads/${attemptOf(git(work, "rev-parse", "HEAD"))}`);
  return { ...repositories, pushes };
}

it("waits for the existing run, without pushing again, when continuing at a commit origin already has", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, pushes, work } = pushedResolution();
  const { ci, green } = fakeCi({ origin, other });

  const merged = repo(work).continueMerge({ ci });

  expect([merged, green, created(pushes()).length]).toStrictEqual([
    { ok: true, sha: git(origin, "rev-parse", "v1") },
    [git(origin, "rev-parse", "v1")],
    FIRST_RUN,
  ]);
});

it("waits again for merge-ticket-N's run on --continue at an unchanged commit, and lands it when it turns green", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  const { ci } = fakeCi({ origin, other, red: (run) => run === FIRST_RUN });
  repo(work).merge({ ci });
  const red = git(origin, "rev-parse", pushedBranch(origin));

  const merged = repo(work).continueMerge({ ci });

  expect([merged, git(origin, "rev-parse", "v1"), remoteBranches(origin)]).toStrictEqual([
    { ok: true, sha: red },
    red,
    "v1",
  ]);
});

it("fails when merge-ticket-N's run is still red on --continue, naming the jobs", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  const { ci } = fakeCi({ origin, other, red: () => true });
  repo(work).merge({ ci });

  const merged = repo(work).continueMerge({ ci });

  expect([merged.ok, reasonOf(merged)]).toStrictEqual([false, expect.stringContaining("tests 1/2 (failure).")]);
});

it("pushes a fixed commit on --continue to a fresh branch and lands it, deleting the red one, never forcing a push", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  const { ci, watched } = fakeCi({ origin, other, red: (run) => run === FIRST_RUN });
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  repo(work).merge({ ci });
  git(work, "commit", "-q", "--amend", "-m", "fixed");

  const merged = repo(work).continueMerge({ ci });

  const fixed = attemptOf(git(origin, "rev-parse", "v1"));

  const branches = watched.map((each) => each.split(" ").at(FIRST_FIELD));

  expect([
    merged.ok,
    branches.length,
    branches.at(LAST),
    branches.at(FIRST_FIELD) === fixed,
    remoteBranches(origin),
  ]).toStrictEqual([true, TWO_RUNS, fixed, false, "v1"]);
});
