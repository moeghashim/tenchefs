import { conflictComment, firstRedOf, issueBody, issueTitle, revertedComment, revertsIn } from "../lib/red-v1-issue.ts";
import { expect, it } from "vitest";

const RED_SHA = "bbbb1111bbbb1111bbbb1111bbbb1111bbbb1111";
const REVERT_SHA = "dddd3333dddd3333dddd3333dddd3333dddd3333";
const PULL_REQUEST = 710;
const RED_RUN = 2;

const FACTS = {
  details: "\ncoverage failed steps: Run tests",
  failedJobs: ["coverage", "tests (3/6)"],
  firstRed: { sha: RED_SHA, subject: "A deleted message reaches every open web UI live (#681) (#710)" },
  newestGreen: null,
  pullRequest: PULL_REQUEST,
  redRun: {
    attempt: 2,
    conclusion: "failure",
    run: RED_RUN,
    sha: RED_SHA,
    status: "completed",
    updatedAt: "2026-11-25T17:11:00Z",
    url: "https://github.com/o/r/actions/runs/2",
  },
  revertAt: "2026-11-25T17:41:00.000Z",
  since: [{ sha: RED_SHA, subject: "A deleted message reaches every open web UI live (#681) (#710)" }],
};

it("titles the fix-forward issue with the failed jobs and the first red commit", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(issueTitle(FACTS)).toBe("v1 is red: coverage, tests (3/6) since bbbb1111");
});

it("the issue's body names its first red commit for the next run to read back", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const body = issueBody(FACTS);

  expect(body).toContain(`- First red commit: ${RED_SHA} (${FACTS.firstRed.subject}), merged by #710`);
  expect(body).toContain("the Red v1 workflow reverts bbbb1111 on v1");
  expect(firstRedOf(body)).toBe(RED_SHA);
});

it("a revert pushed or refused by a conflict is read back as tried", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const comments = [
    revertedComment({ sha: RED_SHA, what: REVERT_SHA }),
    conflictComment({ sha: REVERT_SHA, what: "CONFLICT (modify/delete)" }),
  ].join("\n");

  expect(revertsIn(comments)).toStrictEqual([RED_SHA, REVERT_SHA]);
});

it("a revert in v1's history is read back from git's revert message", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(revertsIn(`Revert "x"\n\nThis reverts commit ${RED_SHA}, reversing\nchanges made to abc.`)).toStrictEqual([
    RED_SHA,
  ]);
});
