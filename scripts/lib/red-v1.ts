import { DateTime, Option } from "effect";

interface V1Run {
  readonly attempt: number;
  readonly conclusion: string;
  readonly run: number;
  readonly sha: string;
  readonly status: string;
  readonly updatedAt: string;
  readonly url: string;
}

interface FixForwardIssue {
  readonly firstRed: string;
  readonly number: number;
}

interface RedV1State {
  readonly commits: readonly string[];
  readonly issue: FixForwardIssue | null;
  readonly nowMillis: number;
  readonly reverted: readonly string[];
  readonly runs: readonly V1Run[];
}

type Action =
  | { readonly kind: "rerun"; readonly run: V1Run }
  | {
      readonly firstRed: string;
      readonly kind: "open";
      readonly newestGreen: V1Run | null;
      readonly redRun: V1Run;
      readonly since: readonly string[];
    }
  | { readonly green: V1Run; readonly issue: number; readonly kind: "close" }
  | { readonly issue: number | null; readonly kind: "revert"; readonly sha: string };

interface Decision {
  readonly actions: readonly Action[];
  readonly lines: readonly string[];
  readonly retryAtMillis?: number;
}

type VerdictKind = "green" | "red" | "rerun" | "running";

type Verdict = { readonly kind: VerdictKind; readonly run: V1Run } | { readonly kind: "none" };

interface Judged {
  readonly sha: string;
  readonly verdict: Verdict;
}

interface SinceGreen {
  readonly green: V1Run | null;
  readonly since: readonly Judged[];
}

interface Red {
  readonly at: number;
  readonly sinceGreen: SinceGreen;
  readonly state: RedV1State;
}

interface Reverting {
  readonly firstRed: string;
  readonly newer: readonly Judged[];
  readonly redRun: V1Run;
}

const COMPLETED = "completed";
const SUCCESS = "success";
const NO_VERDICT = new Set(["cancelled", "neutral", "skipped"]);
const FIRST_ATTEMPT = 1;
const NEXT = 1;
const START = 0;
const MINUTE_MS = 60_000;
const REVERT_AFTER_MINUTES = 30;
const REVERT_AFTER_MS = REVERT_AFTER_MINUTES * MINUTE_MS;
const NOT_FOUND = -1;
const NONE: Verdict = { kind: "none" };
const UNJUDGED: Judged = { sha: "", verdict: NONE };
const NOTHING: Decision = { actions: [], lines: [] };

function epochMillis(at: string): number {
  return Option.match(DateTime.make(at), { onNone: () => Number.NaN, onSome: DateTime.toEpochMillis });
}

function failed(run: V1Run): boolean {
  return run.status === COMPLETED && run.conclusion !== SUCCESS && !NO_VERDICT.has(run.conclusion);
}

const VERDICTS: readonly (readonly [VerdictKind, (run: V1Run) => boolean])[] = [
  ["green", (run) => run.status === COMPLETED && run.conclusion === SUCCESS],
  ["red", (run) => failed(run) && run.attempt > FIRST_ATTEMPT],
  ["running", (run) => run.status !== COMPLETED],
  ["rerun", (run) => failed(run)],
];

function verdictOf(runs: readonly V1Run[]): Verdict {
  const ordered = runs.toSorted((left, right) => epochMillis(left.updatedAt) - epochMillis(right.updatedAt));
  for (const [kind, matches] of VERDICTS) {
    const found = ordered.find((run) => matches(run)) ?? null;
    if (found !== null) {
      return { kind, run: found };
    }
  }
  return NONE;
}

function greenOf({ verdict }: Judged): V1Run | null {
  if (verdict.kind === "none") {
    return null;
  }
  return verdict.run;
}

function sinceGreenOf({ commits, runs }: RedV1State): SinceGreen {
  const judged = commits.map((sha): Judged => ({ sha, verdict: verdictOf(runs.filter((run) => run.sha === sha)) }));
  const greenAt = judged.findIndex(({ verdict }) => verdict.kind === "green");
  if (greenAt === NOT_FOUND) {
    return { green: null, since: judged };
  }
  return { green: greenOf(judged.at(greenAt) ?? UNJUDGED), since: judged.slice(START, greenAt) };
}

function reruns(since: readonly Judged[]): readonly Action[] {
  return since.flatMap(({ verdict }): readonly Action[] => {
    if (verdict.kind !== "rerun") {
      return [];
    }
    return [{ kind: "rerun", run: verdict.run }];
  });
}

function waitLine({ sha, verdict }: Judged): string {
  if (verdict.kind === "running") {
    return `waits: Check run ${String(verdict.run.run)} on the newer commit ${sha} is still running: ${verdict.run.url}`;
  }
  return `waits: the red Check run on the newer commit ${sha} waits for its rerun`;
}

function revertAtMillisOf(redRun: V1Run): number {
  return epochMillis(redRun.updatedAt) + REVERT_AFTER_MS;
}

function revertAtOf(redRun: V1Run): string {
  return DateTime.formatIso(DateTime.makeUnsafe(revertAtMillisOf(redRun)));
}

function waiting(line: string): Decision {
  return { actions: [], lines: [line] };
}

function issueNumber({ issue }: RedV1State): number | null {
  if (issue === null) {
    return null;
  }
  return issue.number;
}

function revert(state: RedV1State, { firstRed, newer, redRun }: Reverting): Decision {
  if (state.nowMillis < revertAtMillisOf(redRun)) {
    const line = `waits: ${firstRed} has been red since ${redRun.updatedAt}; it is reverted at ${revertAtOf(redRun)}`;
    return { ...waiting(line), retryAtMillis: revertAtMillisOf(redRun) };
  }
  if (state.reverted.includes(firstRed)) {
    return waiting(`skipped: ${firstRed} was reverted already`);
  }
  const pending = newer.find(({ verdict }) => verdict.kind === "running" || verdict.kind === "rerun") ?? null;
  if (pending !== null) {
    return waiting(waitLine(pending));
  }
  return { actions: [{ issue: issueNumber(state), kind: "revert", sha: firstRed }], lines: [] };
}

function opened({ at, sinceGreen, state }: Red, oldest: Judged, redRun: V1Run): readonly Action[] {
  if (state.issue !== null) {
    return [];
  }
  const since = sinceGreen.since.slice(START, at + NEXT).map(({ sha }) => sha);
  return [{ firstRed: oldest.sha, kind: "open", newestGreen: sinceGreen.green, redRun, since }];
}

function whenRed(red: Red): Decision {
  const oldest = red.sinceGreen.since.at(red.at) ?? UNJUDGED;
  if (oldest.verdict.kind !== "red") {
    return NOTHING;
  }
  const redRun = oldest.verdict.run;
  const newer = red.sinceGreen.since.slice(START, red.at);
  const reverting = revert(red.state, { firstRed: oldest.sha, newer, redRun });
  return { ...reverting, actions: [...opened(red, oldest, redRun), ...reverting.actions] };
}

function closing({ issue }: RedV1State, { green, since }: SinceGreen): readonly Action[] {
  if (issue === null || green === null || since.some(({ sha }) => sha === issue.firstRed)) {
    return [];
  }
  return [{ green, issue: issue.number, kind: "close" }];
}

function redV1Decision(state: RedV1State): Decision {
  const sinceGreen = sinceGreenOf(state);
  const rerun = reruns(sinceGreen.since);
  const at = sinceGreen.since.findLastIndex(({ verdict }) => verdict.kind === "red");
  if (at === NOT_FOUND) {
    return { actions: [...rerun, ...closing(state, sinceGreen)], lines: [] };
  }
  const red = whenRed({ at, sinceGreen, state });
  return { ...red, actions: [...rerun, ...red.actions] };
}

export type { Action, FixForwardIssue, RedV1State, V1Run };
export { redV1Decision, revertAtOf };
