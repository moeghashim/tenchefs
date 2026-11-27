import { field, list, parseJson, text } from "./json.ts";
import type { Outcome } from "./tools.ts";

type Command = (args: readonly string[]) => Outcome<string>;

interface CheckRunOn {
  readonly conclusion: string;
  readonly event: string;
  readonly sha: string;
  readonly status: string;
  readonly url: string;
}

interface Choosing {
  readonly commits: readonly string[];
  readonly runs: readonly unknown[];
}

interface Chosen {
  readonly sha: string;
  readonly url: string;
}

interface Choice {
  readonly chosen: Chosen | null;
  readonly lines: readonly string[];
}

interface Seams {
  readonly gh: Command;
  readonly git: Command;
}

interface Released {
  readonly lines: readonly string[];
  readonly outcome: Outcome<string>;
}

interface Ahead {
  readonly ahead: readonly string[];
  readonly sha: string;
}

type Judged = { readonly green: true; readonly url: string } | { readonly green: false; readonly why: string };

const GREEN = "success";
const CANCELLED = "cancelled";
const COMPLETED = "completed";
const PUSH = "push";
const DISPATCH = "workflow_dispatch";
const NONE = 0;
const DEPTH = 50;
const RUNS = 200;
const RUN_LIST = [
  "run",
  "list",
  "--workflow",
  "Check",
  "--branch",
  "v1",
  "--limit",
  String(RUNS),
  "--json",
  "headSha,status,conclusion,url,event",
] as const;

function textOf(value: unknown, key: string): string {
  return text(field(value, key)) ?? "";
}

function runOf(value: unknown): readonly CheckRunOn[] {
  const sha = textOf(value, "headSha");
  if (sha === "") {
    return [];
  }
  return [
    {
      conclusion: textOf(value, "conclusion"),
      event: textOf(value, "event"),
      sha,
      status: textOf(value, "status"),
      url: textOf(value, "url"),
    },
  ];
}

function runsJudging(all: readonly CheckRunOn[], sha: string, commits: readonly string[]): readonly CheckRunOn[] {
  const runs = all.filter((run) => run.sha === sha);
  const [head] = commits;
  const [newest] = runs;
  return runs.filter((run) => run.event === PUSH || (sha === head && run === newest && run.event === DISPATCH));
}

function notGreen(runs: readonly CheckRunOn[]): Judged {
  const running = runs.filter(({ status }) => status !== COMPLETED).map(({ url }) => url);
  const red = runs.filter(({ conclusion }) => conclusion !== CANCELLED).map(({ url }) => url);
  const [newest] = runs.map(({ url }) => url);
  const [firstRunning] = running;
  const [firstRed] = red;
  if (typeof firstRunning === "string") {
    return { green: false, why: `its Check run is still running (${firstRunning})` };
  }
  if (typeof firstRed === "string") {
    return { green: false, why: `its Check run is red (${firstRed})` };
  }
  return { green: false, why: `its Check runs were all cancelled (${newest ?? ""})` };
}

function judged(runs: readonly CheckRunOn[]): Judged {
  if (runs.length === NONE) {
    return { green: false, why: "it has no Check push run" };
  }
  const [green] = runs.filter(({ conclusion }) => conclusion === GREEN).map(({ url }) => url);
  if (typeof green === "string") {
    return { green: true, url: green };
  }
  return notGreen(runs);
}

function chooseReleaseCommit({ commits, runs }: Choosing): Choice {
  const parsed = runs.flatMap((value) => runOf(value));
  const lines: string[] = [];
  for (const sha of commits) {
    const verdict = judged(runsJudging(parsed, sha, commits));
    if (verdict.green) {
      lines.push(`chose ${sha}: its Check run is green (${verdict.url})`);
      return { chosen: { sha, url: verdict.url }, lines };
    }
    lines.push(`skipped ${sha}: ${verdict.why}`);
  }
  lines.push(`chose nothing: none of the newest ${String(commits.length)} v1 commits has a green Check run`);
  return { chosen: null, lines };
}

function mainAhead({ ahead, sha }: Ahead): Outcome<string> {
  if (ahead.length === NONE) {
    return { ok: true, value: sha };
  }
  return {
    ok: false,
    reason: `main has ${String(ahead.length)} commits ${sha} lacks, so it can't fast-forward to it. Merge them into v1 first:\n${ahead.join("\n")}`,
  };
}

function linesOf(output: string): readonly string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function choiceFrom({ gh, git }: Seams): Outcome<Choice> {
  const commits = git(["rev-list", "--first-parent", `--max-count=${String(DEPTH)}`, "origin/v1"]);
  if (!commits.ok) {
    return commits;
  }
  const listed = gh(RUN_LIST);
  if (!listed.ok) {
    return listed;
  }
  const runs = list(parseJson(listed.value)) ?? [];
  return { ok: true, value: chooseReleaseCommit({ commits: linesOf(commits.value), runs }) };
}

function releaseChoice(seams: Seams): Released {
  const choice = choiceFrom(seams);
  if (!choice.ok) {
    return { lines: [], outcome: choice };
  }
  const { chosen, lines } = choice.value;
  if (chosen === null) {
    return { lines, outcome: { ok: false, reason: "no v1 commit has a green Check run to release" } };
  }
  const ahead = seams.git(["log", "--format=%h %s", `${chosen.sha}..origin/main`]);
  if (!ahead.ok) {
    return { lines, outcome: ahead };
  }
  return { lines, outcome: mainAhead({ ahead: linesOf(ahead.value), sha: chosen.sha }) };
}

export { releaseChoice };
