import type { V1Run } from "./red-v1.ts";

interface Commit {
  readonly sha: string;
  readonly subject: string;
}

interface IssueFacts {
  readonly details: string;
  readonly failedJobs: readonly string[];
  readonly firstRed: Commit;
  readonly newestGreen: V1Run | null;
  readonly pullRequest: number | null;
  readonly redRun: V1Run;
  readonly revertAt: string;
  readonly since: readonly Commit[];
}

interface RevertNote {
  readonly sha: string;
  readonly what: string;
}

const START = 0;
const SHORT = 8;
const SHA_GROUP = 1;
const FIRST_RED = /<!-- red-v1 first-red: (?<sha>[0-9a-f]+) -->/u;
const TRIED = /<!-- red-v1 revert-tried: (?<sha>[0-9a-f]+) -->/gu;
const REVERTS = /This reverts commit (?<sha>[0-9a-f]{40})/gu;

function short(sha: string): string {
  return sha.slice(START, SHORT);
}

function mergedBy(number: number | null): string {
  if (number === null) {
    return "no pull request found";
  }
  return `merged by #${String(number)}`;
}

function jobsOf(failedJobs: readonly string[]): string {
  if (failedJobs.length === START) {
    return "the run";
  }
  return failedJobs.join(", ");
}

function issueTitle({ failedJobs, firstRed }: IssueFacts): string {
  return `v1 is red: ${jobsOf(failedJobs)} since ${short(firstRed.sha)}`;
}

function greenLine(green: V1Run | null): string {
  if (green === null) {
    return "- Newest green commit: none among the runs read";
  }
  return `- Newest green commit: ${green.sha} (${green.url})`;
}

function detailsOf(details: string): string {
  if (details.trim() === "") {
    return "(no failing tests read from the log)";
  }
  return details.trim();
}

function issueBody(facts: IssueFacts): string {
  const { firstRed, redRun } = facts;
  const commits = facts.since.map(({ sha, subject }) => `  - ${short(sha)} ${subject}`).join("\n");
  return [
    `v1's Check went red on ${short(firstRed.sha)} and stayed red after one rerun of its failed jobs. A fix-forward goes first in line.`,
    "",
    `- First red commit: ${firstRed.sha} (${firstRed.subject}), ${mergedBy(facts.pullRequest)}`,
    `- Red run: ${redRun.url}`,
    `- Failed jobs: ${jobsOf(facts.failedJobs)}`,
    greenLine(facts.newestGreen),
    "- Commits since the newest green run, newest first:",
    commits,
    "",
    `If v1 has no green Check run by ${facts.revertAt}, the Red v1 workflow reverts ${short(firstRed.sha)} on v1.`,
    "",
    "## Failing tests",
    "",
    "```",
    detailsOf(facts.details),
    "```",
    "",
    `<!-- red-v1 first-red: ${firstRed.sha} -->`,
  ].join("\n");
}

function closeComment(green: V1Run): string {
  return `v1 is green again: Check run ${String(green.run)} on ${short(green.sha)} passed (${green.url}). Closing.`;
}

function revertedComment({ sha, what: revert }: RevertNote): string {
  return `v1 had no green Check run 30 minutes after ${short(sha)} went red, so ${short(revert)} reverts it on v1, and Check runs on v1 again. The work must land again: reopen its ticket, fix the cause on its branch, and land again by the landing steps.\n\n<!-- red-v1 revert-tried: ${sha} -->`;
}

function conflictComment({ sha, what: output }: RevertNote): string {
  return `v1 had no green Check run 30 minutes after ${short(sha)} went red, but its revert conflicts, so nothing was pushed. Fix v1 forward by hand.\n\n\`\`\`\n${output.trim()}\n\`\`\`\n\n<!-- red-v1 revert-tried: ${sha} -->`;
}

function firstRedOf(body: string): string | null {
  const [, sha = null] = FIRST_RED.exec(body) ?? [];
  return sha;
}

function revertsIn(log: string): readonly string[] {
  return [...log.matchAll(TRIED), ...log.matchAll(REVERTS)]
    .map((match: readonly string[]) => match.at(SHA_GROUP) ?? "")
    .filter((sha) => sha !== "");
}

export type { Commit };
export { closeComment, conflictComment, firstRedOf, issueBody, issueTitle, revertedComment, revertsIn };
