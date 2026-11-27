import { DateTime, Option } from "effect";
import { field, list, parseJson, text } from "./json.ts";
import type { Outcome } from "./tools.ts";
import { isDocs } from "./test-selection.ts";

type Command = (args: readonly string[]) => Outcome<string>;

interface Asked {
  readonly event: string;
  readonly nowMillis: number;
  readonly sha: string;
  readonly thisRun: string;
}

interface Deciding {
  readonly asked: Asked;
  readonly gh: Command;
  readonly git: Command;
}

interface Go {
  readonly go: boolean;
  readonly line: string;
  readonly promote: boolean;
  readonly retryAtMillis?: number;
}

interface ListedRun {
  readonly run: string;
  readonly startedAt: string;
}

interface SinceTag {
  readonly changed: readonly string[];
  readonly deployed: boolean;
  readonly tag: string;
}

interface Between {
  readonly git: Command;
  readonly sha: string;
  readonly tag: string;
}

const DISPATCH = "workflow_dispatch";
const WAIT_MINUTES = 30;
const MINUTE_MS = 60_000;
const WAIT_MS = WAIT_MINUTES * MINUTE_MS;
const NONE = 0;
const RUNS = 50;
const GATE_JOB = "browser ";
const SKIPPED = "skipped";
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/u;
const NOT_USER_FACING_DIRECTORIES = ["scripts/", ".github/", "app/modules/testing/"];
const TESTS_DIRECTORY = /(?:^|\/)tests\//u;

function isUserFacing(file: string): boolean {
  return (
    !isDocs(file) &&
    !TEST_FILE.test(file) &&
    !TESTS_DIRECTORY.test(file) &&
    !NOT_USER_FACING_DIRECTORIES.some((directory) => file.startsWith(directory))
  );
}

function linesOf(output: string): readonly string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function newestDeployTag(git: Command): Outcome<string> {
  const tags = git([
    "for-each-ref",
    "--sort=-creatordate",
    "--count=1",
    "--format=%(refname:short)",
    "refs/tags/deploy/",
  ]);
  if (!tags.ok) {
    return tags;
  }
  const [tag = ""] = linesOf(tags.value);
  return { ok: true, value: tag };
}

function sinceTag({ git, sha, tag }: Between): Outcome<SinceTag> {
  const ahead = git(["rev-list", "--count", `${tag}..${sha}`]);
  if (!ahead.ok) {
    return ahead;
  }
  const changed = git(["diff", "--name-only", tag, sha]);
  if (!changed.ok) {
    return changed;
  }
  return { ok: true, value: { changed: linesOf(changed.value), deployed: Number(ahead.value.trim()) === NONE, tag } };
}

function runOf(value: unknown): readonly ListedRun[] {
  const run = field(value, "databaseId");
  const startedAt = text(field(value, "startedAt"));
  if (typeof run !== "number" || typeof startedAt !== "string") {
    return [];
  }
  return [{ run: String(run), startedAt }];
}

function epochMillis(at: string): number {
  return Option.match(DateTime.make(at), { onNone: () => Number.NaN, onSome: DateTime.toEpochMillis });
}

function ranTheGate(gh: Command, run: string): Outcome<boolean> {
  const viewed = gh(["run", "view", run, "--json", "jobs"]);
  if (!viewed.ok) {
    return viewed;
  }
  const jobs = list(field(parseJson(viewed.value), "jobs")) ?? [];
  const gate = jobs.filter((job) => (text(field(job, "name")) ?? "").startsWith(GATE_JOB));
  return { ok: true, value: gate.some((job) => text(field(job, "conclusion")) !== SKIPPED) };
}

function recentRuns(gh: Command, { nowMillis, thisRun }: Asked): Outcome<readonly ListedRun[]> {
  const listed = gh([
    "run",
    "list",
    "--workflow",
    "Release",
    "--limit",
    String(RUNS),
    "--json",
    "databaseId,startedAt",
  ]);
  if (!listed.ok) {
    return listed;
  }
  const runs = (list(parseJson(listed.value)) ?? []).flatMap((value) => runOf(value));
  return {
    ok: true,
    value: runs.filter(({ run, startedAt }) => run !== thisRun && nowMillis - epochMillis(startedAt) < WAIT_MS),
  };
}

function recentGateRun({ asked, gh }: Deciding): Outcome<string> {
  const recent = recentRuns(gh, asked);
  if (!recent.ok) {
    return recent;
  }
  for (const { run, startedAt } of recent.value) {
    const gate = ranTheGate(gh, run);
    if (!gate.ok) {
      return gate;
    }
    if (gate.value) {
      return { ok: true, value: startedAt };
    }
  }
  return { ok: true, value: "" };
}

function withoutRecentGateRun(deciding: Deciding, why: string): Outcome<Go> {
  const recent = recentGateRun(deciding);
  if (!recent.ok) {
    return recent;
  }
  if (recent.value !== "") {
    const retryAtMillis = epochMillis(recent.value) + WAIT_MS;
    const retryAt = DateTime.formatIso(DateTime.makeUnsafe(retryAtMillis));
    const line = `waits: a gate run started at ${recent.value}, under ${String(WAIT_MINUTES)} minutes ago; deciding again at ${retryAt}`;
    return { ok: true, value: { go: false, line, promote: false, retryAtMillis } };
  }
  return {
    ok: true,
    value: {
      go: true,
      line: `runs: ${why}, and no gate run started in the last ${String(WAIT_MINUTES)} minutes`,
      promote: true,
    },
  };
}

function onlyMoveMain({ asked: { sha }, git }: Deciding, tag: string): Outcome<Go> {
  const ahead = git(["rev-list", "--count", `origin/main..${sha}`]);
  if (!ahead.ok) {
    return ahead;
  }
  if (Number(ahead.value.trim()) === NONE) {
    return {
      ok: true,
      value: {
        go: false,
        line: `skipped: nothing user-facing since ${tag}, and main already has ${sha}`,
        promote: false,
      },
    };
  }
  return {
    ok: true,
    value: {
      go: false,
      line: `moves main: nothing user-facing since ${tag}, so main takes ${sha}'s workflows without the gate or a deploy`,
      promote: true,
    },
  };
}

function afterTag(deciding: Deciding, { changed, deployed, tag }: SinceTag): Outcome<Go> {
  if (deployed) {
    return {
      ok: true,
      value: {
        go: false,
        line: `skipped: ${deciding.asked.sha} is already deployed (at or behind ${tag})`,
        promote: false,
      },
    };
  }
  const userFacing = changed.find((file) => isUserFacing(file));
  if (typeof userFacing !== "string") {
    return onlyMoveMain(deciding, tag);
  }
  return withoutRecentGateRun(deciding, `${userFacing} is user-facing and changed since ${tag}`);
}

function automatic(deciding: Deciding): Outcome<Go> {
  const tag = newestDeployTag(deciding.git);
  if (!tag.ok) {
    return tag;
  }
  if (tag.value === "") {
    return withoutRecentGateRun(deciding, "no deploy/* tag yet");
  }
  const since = sinceTag({ git: deciding.git, sha: deciding.asked.sha, tag: tag.value });
  if (!since.ok) {
    return since;
  }
  return afterTag(deciding, since.value);
}

function releaseGo(deciding: Deciding): Outcome<Go> {
  if (deciding.asked.event === DISPATCH) {
    return { ok: true, value: { go: true, line: `runs: ${DISPATCH} always runs`, promote: true } };
  }
  return automatic(deciding);
}

export { isUserFacing, releaseGo };
