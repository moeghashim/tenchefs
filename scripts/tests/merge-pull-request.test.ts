import { expect, it } from "vitest";
import type { PullRequest } from "../lib/merge-pull-request.ts";
import type { Stopped } from "../lib/merge-steps.ts";
import { fake } from "./lib/fake-gh.ts";

const PR = "https://github.com/o/r/pull/9";
const OPENED = [{ number: 9, url: PR }];
const LANDING = { branch: "merge-ticket-7-abc", sha: "head7", title: "Merge ticket-7: Add the c table (#7)" };
const BODY =
  "Opened by `pnpm merge-ticket` for review: v1 is fast-forwarded to merge-ticket-7-abc's head once its Check run is green, which marks this pull request merged.";

function reasonOf(pr: PullRequest | Stopped): string {
  if ("kind" in pr) {
    return pr.reason;
  }
  return pr.url;
}

function called(calls: readonly string[], prefix: string): readonly string[] {
  return calls.filter((call) => call.startsWith(prefix));
}

it("opens a pull request from merge-ticket-N's pushed branch into v1 when none is open", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [], "pr create": [PR], "pr list": [[], OPENED], view: [] });

  const { logs, pr } = gh.pullRequest(LANDING);

  expect([pr, logs, called(gh.calls(), "pr create")]).toStrictEqual([
    { number: 9, url: PR },
    [`Opened merge-ticket-7-abc's pull request into v1: ${PR}`],
    [`pr create --head merge-ticket-7-abc --base v1 --title Merge ticket-7: Add the c table (#7) --body ${BODY}`],
  ]);
});

it("reuses merge-ticket-N's open pull request instead of opening another", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [], "pr list": [OPENED], view: [] });

  const { logs, pr } = gh.pullRequest(LANDING);

  expect([pr, logs, called(gh.calls(), "pr create")]).toStrictEqual([
    { number: 9, url: PR },
    [`Reusing merge-ticket-7-abc's pull request into v1: ${PR}`],
    [],
  ]);
});

it("stops, naming the command, when the pull request cannot be opened", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [], "pr create": ["fail"], "pr list": [[]], view: [] });

  expect(reasonOf(gh.pullRequest(LANDING).pr)).toBe(
    "Could not open a pull request from merge-ticket-7-abc into v1: gh pr create\nHTTP 502",
  );
});

it("never asks GitHub to merge the pull request: v1 moves only by fast-forward push", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [], "pr create": [PR], "pr list": [[], OPENED], view: [] });

  gh.pullRequest(LANDING);

  expect(gh.calls().filter((call) => /^pr merge|isInMergeQueue/u.test(call))).toStrictEqual([]);
});
