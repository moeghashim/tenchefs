import { ATTEMPTS, BRANCH, TICKET, git, repo, repos } from "./lib/merge-repos.ts";
import { DONE, stop } from "../lib/merge-steps.ts";
import { expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import type { Merged } from "../lib/merge-ticket.ts";
import type { Step } from "../lib/merge-steps.ts";
import path from "node:path";

const MERGE_BRANCH = `merge-ticket-${TICKET}`;
const ONE_ATTEMPT = 1;
const TWO_ATTEMPTS = 2;
const FIRST_RUN = 1;
const FIRST_FIELD = 0;
const EXECUTABLE = 0o755;
const CREATED = /^0+ \S+ refs\/heads\/merge-ticket-/u;

interface FakeCi {
  readonly ci: (branch: string, sha: string, rerunRed: boolean) => Step;
  readonly green: readonly string[];
  readonly reruns: readonly boolean[];
  readonly watched: readonly string[];
}

interface FakeCiOptions {
  readonly moveV1?: (run: number) => boolean;
  readonly origin: string;
  readonly other: string;
  readonly red?: (run: number) => boolean;
}

function moveV1(other: string): void {
  git(other, "commit", "-q", "--allow-empty", "-m", "moved");
  git(other, "push", "-q", "origin", "HEAD:v1");
}

function fakeCi({
  moveV1: moves = (): boolean => false,
  origin,
  other,
  red = (): boolean => false,
}: FakeCiOptions): FakeCi {
  const green: string[] = [];
  const reruns: boolean[] = [];
  const watched: string[] = [];
  return {
    ci: (branch, sha, rerunRed): Step => {
      watched.push(`${branch} ${sha} ${git(origin, "rev-parse", branch)}`);
      reruns.push(rerunRed);
      if (moves(watched.length)) {
        moveV1(other);
      }
      if (red(watched.length)) {
        return stop(`${branch}'s latest Check run is red: tests 1/2 (failure).`);
      }
      green.push(sha);
      return DONE;
    },
    green,
    reruns,
    watched,
  };
}

function reasonOf(merged: Merged): string {
  if (merged.ok) {
    return "merged";
  }
  return merged.reason;
}

function remoteBranches(origin: string): string {
  return git(origin, "branch", "--list", "--format=%(refname:short)");
}

function v1Updates(origin: string): readonly string[] {
  return git(origin, "reflog", "--format=%H", "v1").split("\n");
}

function logAllRefUpdates(origin: string): void {
  git(origin, "config", "core.logAllRefUpdates", "always");
}

it("pushes merge-ticket-N, and fast-forwards v1 to the exact commit whose Check run is green", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  const { ci, green, watched } = fakeCi({ origin, other });

  const merged = repo(work).merge({ ci });

  const sha = git(origin, "rev-parse", "v1");

  expect([merged, green, watched, remoteBranches(origin)]).toStrictEqual([
    { attempts: ONE_ATTEMPT, ok: true, sha },
    [sha],
    [`${MERGE_BRANCH} ${sha} ${sha}`],
    "v1",
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

  expect([merged.ok, watched.map((each) => each.split(" ").at(FIRST_FIELD))]).toStrictEqual([true, [MERGE_BRANCH]]);
});

it("stops on a red Check run of merge-ticket-N, pushes nothing to v1 and keeps the branch for a rerun", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  const before = git(origin, "rev-parse", "v1");
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  const { ci, reruns } = fakeCi({ origin, other, red: () => true });

  const merged = repo(work).merge({ ci });

  expect([merged.ok, git(origin, "rev-parse", "v1"), remoteBranches(origin), reruns]).toStrictEqual([
    false,
    before,
    `${MERGE_BRANCH}
v1`,
    [false],
  ]);
  expect(reasonOf(merged)).toContain(`tests 1/2 (failure).\nNothing was pushed to v1. The merge is on ${MERGE_BRANCH}`);
});

it("merges again when v1 moves while it waits for CI, and pushes v1 only to a green commit", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  logAllRefUpdates(origin);
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  const { ci, green } = fakeCi({ moveV1: (run) => run === FIRST_RUN, origin, other });

  const merged = repo(work).merge({ ci });

  const sha = git(origin, "rev-parse", "v1");

  expect([
    merged,
    green.length,
    green.slice(ONE_ATTEMPT),
    git(origin, "log", "-1", "--format=%s", "v1^1"),
  ]).toStrictEqual([{ attempts: TWO_ATTEMPTS, ok: true, sha }, TWO_ATTEMPTS, [sha], "moved"]);
  expect(v1Updates(origin).filter((update) => update !== git(origin, "rev-parse", "v1^1"))).toStrictEqual([sha]);
});

it("never forces v1: when v1 keeps moving during CI, v1 keeps every move and never gets the merge", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  logAllRefUpdates(origin);
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  const { ci, green } = fakeCi({ moveV1: () => true, origin, other });

  const merged = repo(work).merge({ ci });

  const moves = git(origin, "log", "--format=%s", "v1").split("\n");

  expect([merged.ok, green.length, moves.filter((subject) => subject === "moved").length]).toStrictEqual([
    false,
    ATTEMPTS,
    ATTEMPTS,
  ]);
  expect(v1Updates(origin).some((update) => green.includes(update))).toBe(false);
  expect(moves).not.toContain(`Merge ${BRANCH}: Add the c table (#${TICKET})`);
});

it("pushes and watches merge-ticket-N again when continuing a merge resolved by hand", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  repo(other).push({ "notes.txt": "v1\n" });
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  repo(work).merge({});
  repo(work).resolveByHand("both\n");
  const { ci, green } = fakeCi({ origin, other });

  const merged = repo(work).continueMerge({ ci });

  const sha = git(origin, "rev-parse", "v1");

  expect([merged, green, remoteBranches(origin)]).toStrictEqual([
    { attempts: ONE_ATTEMPT, ok: true, sha },
    [sha],
    "v1",
  ]);
});

function recordPushes(origin: string): () => readonly string[] {
  const pushes = path.join(origin, "pushes.log");
  writeFileSync(pushes, "");
  writeFileSync(path.join(origin, "hooks", "post-receive"), `#!/bin/sh\ncat >> "${pushes}"\n`, { mode: EXECUTABLE });
  return (): readonly string[] =>
    readFileSync(pushes, "utf8")
      .split("\n")
      .filter((line) => CREATED.test(line));
}

function pushedResolution(): ReturnType<typeof repos> & { readonly created: () => readonly string[] } {
  const repositories = repos();
  const { origin, other, work } = repositories;
  repo(other).push({ "notes.txt": "v1\n" });
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  repo(work).merge({});
  repo(work).resolveByHand("both\n");
  const created = recordPushes(origin);
  git(work, "push", "-q", "origin", `HEAD:refs/heads/${MERGE_BRANCH}`);
  return { ...repositories, created };
}

it("waits for the existing run, without pushing again, when continuing at a commit origin already has", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { created, origin, other, work } = pushedResolution();
  const { ci, green } = fakeCi({ origin, other });

  const merged = repo(work).continueMerge({ ci });

  const sha = git(origin, "rev-parse", "v1");

  expect([merged, green, created().length]).toStrictEqual([{ attempts: ONE_ATTEMPT, ok: true, sha }, [sha], FIRST_RUN]);
});

it("reruns merge-ticket-N's red run once on --continue at an unchanged commit, and merges when it turns green", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  const { ci, reruns } = fakeCi({ origin, other, red: (run) => run === FIRST_RUN });
  repo(work).merge({ ci });
  const red = git(origin, "rev-parse", MERGE_BRANCH);

  const merged = repo(work).continueMerge({ ci });

  expect([merged, reruns, remoteBranches(origin)]).toStrictEqual([
    { attempts: ONE_ATTEMPT, ok: true, sha: red },
    [false, true],
    "v1",
  ]);
});

it("fails when merge-ticket-N's run is still red after the rerun, naming the jobs", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  const { ci, reruns } = fakeCi({ origin, other, red: () => true });
  repo(work).merge({ ci });

  const merged = repo(work).continueMerge({ ci });

  expect([merged.ok, reruns]).toStrictEqual([false, [false, true]]);
  expect(reasonOf(merged)).toContain("tests 1/2 (failure).");
});

it("waits for a moved commit's own run on --continue, without asking for a rerun", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  const { ci, reruns } = fakeCi({ origin, other, red: (run) => run === FIRST_RUN });
  repo(work).merge({ ci });
  const red = git(origin, "rev-parse", MERGE_BRANCH);
  git(work, "commit", "-q", "--amend", "-m", "fixed");

  const merged = repo(work).continueMerge({ ci });

  expect([merged.ok, reruns, git(origin, "rev-parse", "v1") === red]).toStrictEqual([true, [false, false], false]);
});
