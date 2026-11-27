import { DateTime, Option } from "effect";
import type { FixForwardIssue, RedV1State, V1Run } from "./red-v1.ts";
import { field, list, parseJson, text } from "./json.ts";
import { firstRedOf, revertsIn } from "./red-v1-issue.ts";
import type { Command } from "./merge-steps.ts";
import type { Commit } from "./red-v1-issue.ts";
import type { Outcome } from "./tools.ts";
import { run } from "./merge-steps.ts";

interface Reading {
  readonly at: string | null;
  readonly cwd: string;
  readonly gh: Command;
  readonly git: Command;
  readonly nowMillis: number;
}

interface Read {
  readonly commits: readonly Commit[];
  readonly state: RedV1State;
}

interface Ran {
  readonly args: readonly string[];
  readonly command: Command;
  readonly cwd: string;
}

interface IssueRead {
  readonly issue: FixForwardIssue | null;
  readonly tried: readonly string[];
}

interface Listed extends V1Run {
  readonly createdAt: string;
  readonly event: string;
}

const HISTORY = 100;
const START_LINE = 0;
const RUNS = 200;
const V1_EVENTS = new Set(["push", "workflow_dispatch"]);
const ISSUES = "repos/{owner}/{repo}/issues?state=open&creator=github-actions%5Bbot%5D&per_page=100";
const MARKED = '.[] | select((.body // "") | contains("<!-- red-v1 first-red:")) | {number, body}';
const RUN_FIELDS = "databaseId,headSha,status,conclusion,attempt,updatedAt,createdAt,url,event";
const NO_ISSUE: IssueRead = { issue: null, tried: [] };

function ran({ args, command, cwd }: Ran): Outcome<string> {
  const done = run(cwd, ...command, ...args);
  if (!done.ok) {
    return { ok: false, reason: `${[...command, ...args].join(" ")} failed:\n${done.output}` };
  }
  return { ok: true, value: done.output };
}

function epochMillis(at: string): number {
  return Option.match(DateTime.make(at), { onNone: () => Number.NaN, onSome: DateTime.toEpochMillis });
}

function linesOf(output: string): readonly string[] {
  return output.split("\n").filter((line) => line !== "");
}

function commitOf(line: string): Commit {
  const [sha = "", ...subject] = line.split("\t");
  return { sha, subject: subject.join("\t") };
}

function beforeOf(at: string | null): readonly string[] {
  if (at === null) {
    return [];
  }
  return [`--before=${at}`];
}

function readCommits({ at, cwd, git }: Reading): Outcome<readonly Commit[]> {
  const args = ["log", "--first-parent", `-n${String(HISTORY)}`, ...beforeOf(at), "--format=%H%x09%s", "origin/v1"];
  const logged = ran({ args, command: git, cwd });
  if (!logged.ok) {
    return logged;
  }
  return { ok: true, value: linesOf(logged.value).map((line) => commitOf(line)) };
}

function textOf(value: unknown, key: string): string {
  return text(field(value, key)) ?? "";
}

function runOf(value: unknown): readonly Listed[] {
  const number = field(value, "databaseId");
  const attempt = field(value, "attempt");
  if (typeof number !== "number" || typeof attempt !== "number") {
    return [];
  }
  return [
    {
      attempt,
      conclusion: textOf(value, "conclusion"),
      createdAt: textOf(value, "createdAt"),
      event: textOf(value, "event"),
      run: number,
      sha: textOf(value, "headSha"),
      status: textOf(value, "status"),
      updatedAt: textOf(value, "updatedAt"),
      url: textOf(value, "url"),
    },
  ];
}

function atMillisOf(at: string | null): number {
  if (at === null) {
    return Number.POSITIVE_INFINITY;
  }
  return epochMillis(at);
}

function v1RunOf({ createdAt: _createdAt, event: _event, ...v1Run }: Listed): V1Run {
  return v1Run;
}

function readRuns({ at, cwd, gh }: Reading): Outcome<readonly V1Run[]> {
  const args = ["run", "list", "--workflow", "Check", "--branch", "v1", "--limit", String(RUNS), "--json", RUN_FIELDS];
  const listed = ran({ args, command: gh, cwd });
  if (!listed.ok) {
    return listed;
  }
  const atMillis = atMillisOf(at);
  const runs = (list(parseJson(listed.value)) ?? [])
    .flatMap((value) => runOf(value))
    .filter(({ createdAt, event }) => V1_EVENTS.has(event) && epochMillis(createdAt) <= atMillis)
    .map((listedRun) => v1RunOf(listedRun));
  return { ok: true, value: runs };
}

function issueOf(output: string): FixForwardIssue | null {
  const value = parseJson(linesOf(output).at(START_LINE) ?? "");
  const number = field(value, "number");
  const firstRed = firstRedOf(textOf(value, "body"));
  if (typeof number !== "number" || firstRed === null) {
    return null;
  }
  return { firstRed, number };
}

function triedOn({ cwd, gh }: Pick<Reading, "cwd" | "gh">, issue: FixForwardIssue): Outcome<IssueRead> {
  const comments = `repos/{owner}/{repo}/issues/${String(issue.number)}/comments`;
  const read = ran({ args: ["api", "--paginate", comments, "--jq", ".[].body"], command: gh, cwd });
  if (!read.ok) {
    return read;
  }
  return { ok: true, value: { issue, tried: revertsIn(read.value) } };
}

function readIssue({ cwd, gh }: Reading): Outcome<IssueRead> {
  const listed = ran({ args: ["api", "--paginate", ISSUES, "--jq", MARKED], command: gh, cwd });
  if (!listed.ok) {
    return listed;
  }
  const issue = issueOf(listed.value);
  if (issue === null) {
    return { ok: true, value: NO_ISSUE };
  }
  return triedOn({ cwd, gh }, issue);
}

function readReverted({ cwd, git }: Reading): Outcome<readonly string[]> {
  const logged = ran({ args: ["log", `-n${String(RUNS)}`, "--format=%B", "origin/v1"], command: git, cwd });
  if (!logged.ok) {
    return logged;
  }
  return { ok: true, value: revertsIn(logged.value) };
}

function stateOf(reading: Reading, commits: readonly Commit[], runs: readonly V1Run[]): Outcome<RedV1State> {
  const issue = readIssue(reading);
  if (!issue.ok) {
    return issue;
  }
  const reverted = readReverted(reading);
  if (!reverted.ok) {
    return reverted;
  }
  return {
    ok: true,
    value: {
      commits: commits.map(({ sha }) => sha),
      issue: issue.value.issue,
      nowMillis: reading.nowMillis,
      reverted: [...reverted.value, ...issue.value.tried],
      runs,
    },
  };
}

function readRedV1(reading: Reading): Outcome<Read> {
  const commits = readCommits(reading);
  if (!commits.ok) {
    return commits;
  }
  const runs = readRuns(reading);
  if (!runs.ok) {
    return runs;
  }
  const state = stateOf(reading, commits.value, runs.value);
  if (!state.ok) {
    return state;
  }
  return { ok: true, value: { commits: commits.value, state: state.value } };
}

export { ran, readRedV1 };
