import type { Attempt, PushOptions } from "./merge-push.ts";
import type { Command, Step, Stopped } from "./merge-steps.ts";
import { DONE, firstStop, git, lines, run, stepOf, stop, tail } from "./merge-steps.ts";
import { asOneTicketMerge, cleanTree } from "./merge-branch.ts";
import { branchOf, deleteRemoteBranch, push } from "./merge-push.ts";
import { failedStep, mergeInto, regenerateFiles } from "./merge-resolve.ts";
import type { Landed } from "./merge-pull-request.ts";
import type { MergeRules } from "./merge-resolve.ts";
import { appendOnlyMigrations } from "./merge-migrations.ts";
import { lintApproval } from "./merge-lint.ts";
import { renumberAdrs } from "./merge-adrs.ts";

interface MergeOptions extends PushOptions {
  readonly approved?: string;
  readonly attempts: number;
  readonly check: Command;
  readonly cwd: string;
  readonly install: Command;
  readonly log: (line: string) => void;
  readonly migrationsBase: string;
  readonly rules: MergeRules;
}

type Merged =
  | { readonly ok: true; readonly sha: string }
  | { readonly files: readonly string[]; readonly ok: false; readonly reason: string }
  | {
      readonly cutOff: readonly string[];
      readonly files: readonly string[];
      readonly ok: false;
      readonly reason: string;
    };

const LOCKFILE = "pnpm-lock.yaml";
const NONE = 0;
const FIRST_ROUND = 1;

function install(options: MergeOptions): Step {
  const ticket = `ticket-${options.ticket}`;
  if (lines(git(options, "diff", "--name-only", ticket, "HEAD", "--", LOCKFILE).output).length === NONE) {
    return DONE;
  }
  options.log(`${LOCKFILE} differs from ${ticket}'s: running ${options.install.join(" ")}`);
  const installed = run(options.cwd, ...options.install);
  if (installed.ok) {
    return DONE;
  }
  return failedStep({ after: "", command: options.install, ran: installed });
}

function check(options: MergeOptions): Step {
  options.log(`Running ${options.check.join(" ")}`);
  const checked = run(options.cwd, ...options.check);
  if (checked.ok) {
    return DONE;
  }
  return failedStep({
    after: ` The merge is on merge-ticket-${options.ticket}.`,
    command: options.check,
    ran: checked,
  });
}

function fetchedOrigin(options: MergeOptions): Step {
  const ran = git(options, "fetch", "-q", "origin");
  if (ran.ok) {
    return DONE;
  }
  return stop(`git fetch failed.\n${tail(ran.output)}`);
}

function startFromV1(options: MergeOptions): Step {
  const fetchedV1 = fetchedOrigin(options);
  if (fetchedV1.kind === "stopped") {
    return fetchedV1;
  }
  const branch = branchOf(options);
  const checkedOut = git(options, "checkout", "-q", "-B", branch, "origin/v1");
  if (!checkedOut.ok) {
    return stop(`Could not create ${branch} from origin/v1.\n${tail(checkedOut.output)}`);
  }
  return DONE;
}

function attempt(options: MergeOptions): Attempt {
  const started = startFromV1(options);
  if (started.kind === "stopped") {
    return started;
  }
  const stepped = firstStop([
    (): Step => lintApproval(options),
    (): Step => mergeInto({ first: "ours", into: `ticket-${options.ticket}`, options }),
    (): Step => appendOnlyMigrations(options),
    (): Step => install(options),
    (): Step => renumberAdrs({ adrs: options.rules.adrs, cwd: options.cwd, log: options.log }),
    (): Step => check(options),
  ]);
  if (stepped.kind === "stopped") {
    return stepped;
  }
  return push({ options });
}

function finished(outcome: Landed | Stopped): Merged {
  if (outcome.kind === "landed") {
    return { ok: true, sha: outcome.sha };
  }
  const failed = { files: outcome.files, ok: false, reason: outcome.reason } as const;
  if (outcome.cutOff === true) {
    return { ...failed, cutOff: outcome.jobs };
  }
  return failed;
}

function regenerateChanged(options: MergeOptions, base: string): Step {
  const changed = lines(git(options, "diff", "--name-only", base, "HEAD").output);
  const regenerated = regenerateFiles({ files: changed, options });
  if (regenerated.kind === "stopped" || cleanTree(options).kind === "done") {
    return regenerated;
  }
  return firstStop([
    (): Step => stepOf({ ran: git(options, "add", "-u"), what: "git add -u" }),
    (): Step =>
      stepOf({ ran: git(options, "commit", "-q", "--amend", "--no-edit"), what: "Committing the regenerated files" }),
  ]);
}

function checkAndPush({ base, options }: { readonly base: string; readonly options: MergeOptions }): Attempt {
  const stepped = firstStop([
    (): Step => lintApproval(options),
    (): Step => appendOnlyMigrations(options),
    (): Step => install(options),
    (): Step => renumberAdrs({ adrs: options.rules.adrs, cwd: options.cwd, log: options.log }),
    (): Step => regenerateChanged(options, base),
    (): Step => check(options),
  ]);
  if (stepped.kind === "stopped") {
    return stepped;
  }
  return push({ options });
}

function mergeMovedV1(options: MergeOptions): Attempt {
  const base = git(options, "rev-parse", "origin/v1").output;
  const stepped = firstStop([
    (): Step => mergeInto({ first: "theirs", into: "origin/v1", options }),
    (): Step => asOneTicketMerge(options),
  ]);
  if (stepped.kind === "stopped") {
    return stepped;
  }
  return checkAndPush({ base, options });
}

function afterAttempt(options: MergeOptions, outcome: Attempt, round: number): Merged {
  if (outcome.kind !== "moved") {
    return finished(outcome);
  }
  const next = round + FIRST_ROUND;
  if (next > options.attempts) {
    return {
      files: [],
      ok: false,
      reason: `v1 kept moving: gave up after ${options.attempts} rounds. Nothing was pushed to v1.`,
    };
  }
  options.log(
    `v1 moved before the push. Round ${next} of ${options.attempts}: merging the new origin/v1 into ${branchOf(options)}`,
  );
  return afterAttempt(options, mergeMovedV1(options), next);
}

function cleanedUp(options: MergeOptions, merged: Merged): Merged {
  if (merged.ok) {
    deleteRemoteBranch(options);
  }
  return merged;
}

function mergeTicket(options: MergeOptions): Merged {
  const clean = cleanTree(options);
  if (clean.kind === "stopped") {
    return finished(clean);
  }
  options.log(`Merging ticket-${options.ticket} into origin/v1`);
  return cleanedUp(options, afterAttempt(options, attempt(options), FIRST_ROUND));
}

function pushOntoV1(options: MergeOptions): Attempt {
  const branch = branchOf(options);
  if (git(options, "merge-base", "--is-ancestor", "origin/v1", "HEAD").ok) {
    options.log(`origin/v1 has not moved past ${branch}'s v1 parent: checking and pushing ${branch} as it is`);
    const flattened = asOneTicketMerge(options);
    if (flattened.kind === "stopped") {
      return flattened;
    }
    return checkAndPush({ base: git(options, "rev-parse", "HEAD^1").output, options });
  }
  options.log(`origin/v1 moved past ${branch}'s v1 parent: merging it into ${branch} before the push`);
  return mergeMovedV1(options);
}

function continueAttempt(options: MergeOptions): Attempt {
  const branch = branchOf(options);
  const head = git(options, "rev-parse", "--abbrev-ref", "HEAD").output;
  if (head !== branch || !git(options, "rev-parse", "-q", "--verify", "HEAD^2").ok) {
    return stop(
      `Nothing to continue: not on ${branch} with a merge commit at HEAD (on ${head}). Run pnpm merge-ticket ${options.ticket} first.`,
    );
  }
  const stepped = firstStop([(): Step => cleanTree(options), (): Step => fetchedOrigin(options)]);
  if (stepped.kind === "stopped") {
    return stepped;
  }
  return pushOntoV1(options);
}

function continueMerge(options: MergeOptions): Merged {
  options.log(`Checking and pushing merge-ticket-${options.ticket}`);
  return cleanedUp(options, afterAttempt(options, continueAttempt(options), FIRST_ROUND));
}

export type { MergeOptions, Merged };
export { continueMerge, mergeTicket };
