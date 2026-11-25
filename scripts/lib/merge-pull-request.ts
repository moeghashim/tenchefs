import type { Command, Stopped } from "./merge-steps.ts";
import { field, list, parseJson } from "./json.ts";
import { run, stop, tail } from "./merge-steps.ts";

interface PullRequestOptions {
  readonly cwd: string;
  readonly gh: Command;
  readonly log: (line: string) => void;
}

interface Landing {
  readonly branch: string;
  readonly sha: string;
  readonly title: string;
}

interface Landed {
  readonly kind: "landed";
  readonly sha: string;
}

interface PullRequest {
  readonly number: number;
  readonly url: string;
}

const NONE = 0;
const BASE = "v1";
const OPEN = ["--base", BASE, "--state", "open", "--json", "number,url"];

function gh(options: PullRequestOptions, ...args: readonly string[]): ReturnType<typeof run> {
  return run(options.cwd, ...options.gh, ...args);
}

function pullRequestIn(output: string): PullRequest | "none" {
  const first = (list(parseJson(output)) ?? []).at(NONE);
  const number = field(first, "number");
  const url = field(first, "url");
  if (typeof number !== "number" || typeof url !== "string") {
    return "none";
  }
  return { number, url };
}

function openPullRequest(options: PullRequestOptions, landing: Landing): PullRequest | Stopped {
  const listed = gh(options, "pr", "list", "--head", landing.branch, ...OPEN);
  if (!listed.ok) {
    return stop(`Could not list ${landing.branch}'s pull requests: gh pr list\n${tail(listed.output)}`);
  }
  const found = pullRequestIn(listed.output);
  if (found === "none") {
    return stop(`gh pr list printed no pull request for ${landing.branch}.\n${tail(listed.output)}`);
  }
  return found;
}

function createPullRequest(options: PullRequestOptions, landing: Landing): PullRequest | Stopped {
  const body = `Opened by \`pnpm merge-ticket\` for review: v1 is fast-forwarded to ${landing.branch}'s head once its Check run is green, which marks this pull request merged.`;
  const args = ["--head", landing.branch, "--base", BASE, "--title", landing.title, "--body", body];
  const created = gh(options, "pr", "create", ...args);
  if (!created.ok) {
    return stop(`Could not open a pull request from ${landing.branch} into v1: gh pr create\n${tail(created.output)}`);
  }
  const opened = openPullRequest(options, landing);
  if (!("kind" in opened)) {
    options.log(`Opened ${landing.branch}'s pull request into v1: ${opened.url}`);
  }
  return opened;
}

function pullRequestOf({
  landing,
  options,
}: {
  readonly landing: Landing;
  readonly options: PullRequestOptions;
}): PullRequest | Stopped {
  const open = openPullRequest(options, landing);
  if ("kind" in open) {
    return createPullRequest(options, landing);
  }
  options.log(`Reusing ${landing.branch}'s pull request into v1: ${open.url}`);
  return open;
}

export type { Landed, Landing, PullRequest };
export { pullRequestOf };
