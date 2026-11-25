import { BRANCH, TICKET, git, repo, repos } from "./lib/merge-repos.ts";
import { DONE, stop } from "../lib/merge-steps.ts";
import { expect, it } from "vitest";
import type { Step } from "../lib/merge-steps.ts";

const MOVED_LINE = `origin/v1 moved past merge-ticket-${TICKET}'s v1 parent: merging it into merge-ticket-${TICKET} before the push`;
const UNMOVED_LINE = `origin/v1 has not moved past merge-ticket-${TICKET}'s v1 parent: checking and pushing merge-ticket-${TICKET} as it is`;

interface Watched {
  readonly ci: (branch: string, sha: string) => Step;
  readonly lines: string[];
  readonly log: (line: string) => void;
  readonly shas: string[];
}

function watched(): Watched {
  const shas: string[] = [];
  const logged: string[] = [];
  return {
    ci: (_branch, sha): Step => {
      shas.push(sha);
      return DONE;
    },
    lines: logged,
    log: (line): void => {
      logged.push(line);
    },
    shas,
  };
}

function red(): Step {
  return stop("merge-ticket-7's Check run is red: browser.");
}

it("merges the moved v1 into merge-ticket-N on --continue before pushing it", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  repo(work).commit("the ticket", { "ticket.txt": "ticket\n" });
  repo(work).merge({ ci: red });
  repo(other).push({ "fixed.txt": "fixed on v1\n" });
  const moved = git(origin, "rev-parse", "v1");
  const ran = watched();

  const merged = repo(work).continueMerge({ ci: ran.ci, log: ran.log });

  expect([merged, ran.lines.includes(MOVED_LINE), ran.shas]).toStrictEqual([
    { ok: true, sha: git(origin, "rev-parse", "v1") },
    true,
    [git(origin, "rev-parse", "v1")],
  ]);
  expect([
    git(origin, "rev-parse", "v1^1"),
    git(origin, "rev-parse", "v1^2"),
    git(origin, "show", "v1:fixed.txt"),
    git(origin, "log", "-1", "--format=%s", "v1"),
  ]).toStrictEqual([
    moved,
    git(work, "rev-parse", BRANCH),
    "fixed on v1",
    `Merge ${BRANCH}: Add the c table (#${TICKET})`,
  ]);
});

it("pushes merge-ticket-N as it is on --continue when v1 has not moved", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { origin, work } = repos();
  repo(work).commit("the ticket", { "ticket.txt": "ticket\n" });
  repo(work).merge({ ci: red });
  const pushed = git(work, "rev-parse", "HEAD");
  const ran = watched();

  const merged = repo(work).continueMerge({ ci: ran.ci, log: ran.log });

  expect(merged).toStrictEqual({ ok: true, sha: git(origin, "rev-parse", "v1") });
  expect(ran.lines).toContain(UNMOVED_LINE);
  expect([ran.shas, git(origin, "rev-parse", "v1")]).toStrictEqual([[pushed], pushed]);
});

it("stops on --continue when the moved v1 conflicts, then continues once that is resolved", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  repo(work).commit("the ticket", { "notes.txt": "ticket\n" });
  repo(work).merge({ ci: red });
  repo(other).push({ "notes.txt": "v1\n" });

  const stopped = repo(work).continueMerge({});
  repo(work).resolveByHand("both\n");
  const merged = repo(work).continueMerge({});

  expect([stopped, merged]).toMatchObject([
    { files: ["notes.txt"], ok: false },
    { ok: true, sha: git(origin, "rev-parse", "v1") },
  ]);
  expect([
    git(origin, "show", "v1:notes.txt"),
    git(origin, "log", "-1", "--format=%s", "v1^1"),
    git(origin, "rev-parse", "v1^2"),
  ]).toStrictEqual(["both", "v1 moves on", git(work, "rev-parse", BRANCH)]);
});
