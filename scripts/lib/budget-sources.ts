import { DateTime, Option } from "effect";
import { field, list, parseJson, text } from "./json.ts";
import { JUDGED_RUNS } from "./budgets.ts";
import type { Outcome } from "./tools.ts";

type Gh = (args: readonly string[]) => Outcome<string>;
type Git = (args: readonly string[]) => Outcome<string>;

interface MergedPull {
  readonly head: string;
  readonly merged: number;
}

interface DeployTag {
  readonly created: number;
  readonly tag: string;
}

interface Sources {
  readonly gh: Gh;
  readonly git: Git;
}

const NONE = 0;
const ARGUMENTS_SHOWN = 2;
const MERGED_PULLS = [
  "api",
  "repos/{owner}/{repo}/pulls?state=closed&base=v1&sort=updated&direction=desc&per_page=100",
  "--jq",
  "[.[] | {merged_at, head: {sha: .head.sha}}]",
];
const V1_CHECK_RUNS =
  "run list --workflow Check --event push --branch v1 --status completed --limit 30 --json conclusion,startedAt,updatedAt".split(
    " ",
  );
const RELEASE_RUNS =
  `run list --workflow Release --status completed --limit ${JUDGED_RUNS} --json databaseId,startedAt`.split(" ");
const DEPLOY_TAGS = [
  "for-each-ref",
  "--sort=creatordate",
  "--format=%(refname:short) %(creatordate:iso-strict)",
  "refs/tags/deploy/",
];
const GATE_JOB = /^(?:choose the commit|browser \d+\/\d+|e2e-docker|pack smoke|published client|the gate)$/u;
const NOT_A_DURATION = new Set(["cancelled", "skipped"]);

function ghJson(gh: Gh, command: readonly string[]): Outcome<unknown> {
  const ran = gh(command);
  if (!ran.ok) {
    return ran;
  }
  const parsed = parseJson(ran.value);
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: `gh ${command.slice(NONE, ARGUMENTS_SHOWN).join(" ")} printed no JSON` };
  }
  return { ok: true, value: parsed };
}

function ghList(gh: Gh, command: readonly string[]): Outcome<readonly unknown[]> {
  const parsed = ghJson(gh, command);
  if (!parsed.ok) {
    return parsed;
  }
  return { ok: true, value: list(parsed.value) ?? [] };
}

function time(value: unknown): number {
  return Option.match(DateTime.make(text(value) ?? ""), { onNone: () => Number.NaN, onSome: DateTime.toEpochMillis });
}

function mergedPull(pull: unknown): readonly MergedPull[] {
  const merged = time(field(pull, "merged_at"));
  const head = text(field(field(pull, "head"), "sha")) ?? "";
  if (Number.isNaN(merged) || head === "") {
    return [];
  }
  return [{ head, merged }];
}

function mergedPulls(gh: Gh): Outcome<readonly MergedPull[]> {
  const pulls = ghList(gh, MERGED_PULLS);
  if (!pulls.ok) {
    return pulls;
  }
  const merged = pulls.value.flatMap((pull) => mergedPull(pull));
  return { ok: true, value: merged.toSorted((left, right) => right.merged - left.merged) };
}

function committedAt(gh: Gh, sha: string): number {
  const commit = ghJson(gh, ["api", `repos/{owner}/{repo}/commits/${sha}`]);
  if (!commit.ok) {
    return Number.NaN;
  }
  const committer = field(field(commit.value, "commit"), "committer");
  return time(field(committer, "date"));
}

function finite(values: readonly number[]): readonly number[] {
  return values.filter((value) => Number.isFinite(value));
}

function landingTimes(gh: Gh): Outcome<readonly number[]> {
  const pulls = mergedPulls(gh);
  if (!pulls.ok) {
    return pulls;
  }
  const recent = pulls.value.slice(NONE, JUDGED_RUNS);
  return { ok: true, value: finite(recent.map((pull) => pull.merged - committedAt(gh, pull.head))) };
}

function runDuration(run: unknown): number {
  if (NOT_A_DURATION.has(text(field(run, "conclusion")) ?? "")) {
    return Number.NaN;
  }
  return time(field(run, "updatedAt")) - time(field(run, "startedAt"));
}

function v1CheckTimes(gh: Gh): Outcome<readonly number[]> {
  const runs = ghList(gh, V1_CHECK_RUNS);
  if (!runs.ok) {
    return runs;
  }
  return { ok: true, value: finite(runs.value.map((run) => runDuration(run))) };
}

function isGateJob(job: unknown): boolean {
  return GATE_JOB.test(text(field(job, "name")) ?? "") && !NOT_A_DURATION.has(text(field(job, "conclusion")) ?? "");
}

function gateJobEnd(job: unknown): readonly number[] {
  const ended = time(field(job, "completed_at"));
  if (!isGateJob(job) || Number.isNaN(ended)) {
    return [];
  }
  return [ended];
}

function gateEnd(gh: Gh, run: unknown): number {
  const id = field(run, "databaseId");
  if (typeof id !== "number") {
    return Number.NaN;
  }
  const listed = ghJson(gh, ["api", `repos/{owner}/{repo}/actions/runs/${id}/jobs?per_page=100`]);
  if (!listed.ok) {
    return Number.NaN;
  }
  const ends = (list(field(listed.value, "jobs")) ?? []).flatMap((job) => gateJobEnd(job));
  if (ends.length === NONE) {
    return Number.NaN;
  }
  return Math.max(...ends);
}

function releaseGateTimes(gh: Gh): Outcome<readonly number[]> {
  const runs = ghList(gh, RELEASE_RUNS);
  if (!runs.ok) {
    return runs;
  }
  return { ok: true, value: finite(runs.value.map((run) => gateEnd(gh, run) - time(field(run, "startedAt")))) };
}

function deployTag(line: string): readonly DeployTag[] {
  const [tag = "", created = ""] = line.trim().split(" ");
  const at = time(created);
  if (tag === "" || Number.isNaN(at)) {
    return [];
  }
  return [{ created: at, tag }];
}

function deployTags(git: Git): Outcome<readonly DeployTag[]> {
  const listed = git(DEPLOY_TAGS);
  if (!listed.ok) {
    return listed;
  }
  return { ok: true, value: listed.value.split("\n").flatMap((line) => deployTag(line)) };
}

function liveFor(git: Git, tags: readonly DeployTag[], pull: MergedPull): number {
  const first = tags.find(
    (tag) => tag.created >= pull.merged && git(["merge-base", "--is-ancestor", pull.head, tag.tag]).ok,
  );
  return Option.match(Option.fromNullishOr(first), {
    onNone: () => Number.NaN,
    onSome: (tag) => tag.created - pull.merged,
  });
}

function liveTimes(git: Git, tags: readonly DeployTag[], pulls: readonly MergedPull[]): readonly number[] {
  const times: number[] = [];
  for (const pull of pulls) {
    if (times.length === JUDGED_RUNS) {
      break;
    }
    const live = liveFor(git, tags, pull);
    if (Number.isFinite(live)) {
      times.push(live);
    }
  }
  return times;
}

function landedToLiveTimes({ gh, git }: Sources): Outcome<readonly number[]> {
  const pulls = mergedPulls(gh);
  if (!pulls.ok) {
    return pulls;
  }
  const tags = deployTags(git);
  if (!tags.ok) {
    return tags;
  }
  return { ok: true, value: liveTimes(git, tags.value, pulls.value) };
}

export { landedToLiveTimes, landingTimes, releaseGateTimes, v1CheckTimes };
