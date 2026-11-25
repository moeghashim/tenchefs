import { DONE, stop } from "./merge-steps.ts";
import { listed, mergeBase, unapprovedLoosenings } from "./lint-config-guard.ts";
import type { Loosening } from "./lint-config-guard.ts";
import type { Step } from "./merge-steps.ts";

interface LintOptions {
  readonly approved?: string;
  readonly cwd: string;
  readonly log: (line: string) => void;
  readonly ticket: number;
}

const NONE = 0;

function ticketOf(options: LintOptions): string {
  return `ticket-${options.ticket}`;
}

function refusal(options: LintOptions, found: readonly Loosening[]): Step {
  return stop(
    [
      `${ticketOf(options)} loosens the lint config, which needs Matt's approval:`,
      ...listed(found),
      `Nothing was pushed. If Matt approved it on the board, run pnpm merge-ticket ${options.ticket} --approved=<board msg id>.`,
    ].join("\n"),
    ...new Set(found.map((loosening) => loosening.file)),
  );
}

function loosenings(options: LintOptions): Step {
  const head = ticketOf(options);
  const base = mergeBase({ cwd: options.cwd, head });
  if (!base.ok) {
    return stop(base.reason);
  }
  const found = unapprovedLoosenings({ base: base.value, cwd: options.cwd, head });
  if (!found.ok) {
    return stop(found.reason);
  }
  if (found.value.length === NONE) {
    return DONE;
  }
  return refusal(options, found.value);
}

function lintApproval(options: LintOptions): Step {
  const approved = options.approved ?? "";
  if (approved === "") {
    return loosenings(options);
  }
  options.log(`--approved=${approved}: the merge records Lint-approved-by: board msg ${approved}`);
  return DONE;
}

function approvalTrailer(approved: string): string {
  if (approved === "") {
    return "";
  }
  return `\n\nLint-approved-by: board msg ${approved}`;
}

export { approvalTrailer, lintApproval };
