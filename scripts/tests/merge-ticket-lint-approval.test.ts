import { TICKET, git, repo, repos } from "./lib/merge-repos.ts";
import { expect, it } from "vitest";
import { LOOSENINGS as loosenings, TIGHTENINGS as tightenings, withRules } from "./lib/lint-config-cases.ts";
import type { Merged } from "../lib/merge-ticket.ts";

const APPROVAL = "4367";

function refusal(merged: Merged): { readonly files: readonly string[]; readonly reason: string } {
  if (merged.ok) {
    return { files: [], reason: "merged" };
  }
  return { files: merged.files, reason: merged.reason };
}

it.each(loosenings)(
  "refuses a ticket with $name, naming the file and the hunk",
  {
    timeout: 10_000,
  },
  ({ file, files, hunk, what }) => {
    expect.hasAssertions();

    const { origin, work } = repos();
    const before = git(origin, "rev-parse", "v1");
    repo(work).commit("the ticket", files);

    const refused = refusal(repo(work).merge({}));

    expect(refused.files).toStrictEqual([file]);
    expect(refused.reason).toContain(`${file}: ${what}, in the hunk:\n@@ -`);
    expect(refused.reason).toContain(hunk);
    expect(refused.reason).toContain(
      `Nothing was pushed. If Matt approved it on the board, run pnpm merge-ticket ${TICKET} --approved=<board msg id>.`,
    );
    expect(git(origin, "rev-parse", "v1")).toBe(before);
  },
);

it.each(loosenings)(
  "lands a ticket with $name once --approved names the board message, recording it as a trailer",
  {
    timeout: 10_000,
  },
  ({ files }) => {
    expect.hasAssertions();

    const { origin, work } = repos();
    repo(work).commit("the ticket", files);

    const merged = repo(work).merge({ approved: APPROVAL });

    expect(merged).toStrictEqual({ ok: true, sha: git(origin, "rev-parse", "v1") });
    expect(git(origin, "log", "-1", "--format=%(trailers:key=Lint-approved-by,valueonly)", "v1")).toBe(
      `board msg ${APPROVAL}`,
    );
  },
);

it.each(tightenings)("lands a ticket with $name without an approval", { timeout: 10_000 }, ({ files }) => {
  expect.hasAssertions();

  const { origin, work } = repos();
  repo(work).commit("the ticket", files);

  const merged = repo(work).merge({});

  expect(merged).toStrictEqual({ ok: true, sha: git(origin, "rev-parse", "v1") });
  expect(git(origin, "log", "-1", "--format=%(trailers:key=Lint-approved-by,valueonly)", "v1")).toBe("");
});

it("keeps the approval trailer when merge-ticket --continue lands a merge resolved by hand", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { origin, other, work } = repos();
  repo(other).push({ "notes.txt": "v1\n" });
  repo(work).commit("the ticket", { ...withRules({ "no-console": "off" }), "notes.txt": "ticket\n" });
  repo(work).merge({ approved: APPROVAL });
  repo(work).resolveByHand("both\n");

  const merged = repo(work).continueMerge({ approved: APPROVAL });

  expect(merged).toStrictEqual({ ok: true, sha: git(origin, "rev-parse", "v1") });
  expect(git(origin, "log", "-1", "--format=%(trailers:key=Lint-approved-by,valueonly)", "v1")).toBe(
    `board msg ${APPROVAL}`,
  );
});

it("refuses a ticket that shares no history with v1, since it has no merge base to diff against", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { work } = repos();
  git(work, "checkout", "-q", "--orphan", "orphan");
  repo(work).commit("unrelated", { "notes.txt": "orphan\n" });
  git(work, "branch", "-q", "-D", `ticket-${String(TICKET)}`);
  git(work, "branch", "-q", "-m", `ticket-${String(TICKET)}`);

  expect(refusal(repo(work).merge({})).reason).toContain(
    `Could not find ticket-${String(TICKET)}'s merge base with origin/v1.`,
  );
});
