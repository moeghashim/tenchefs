import { DONE, git, stepOf, stop, tail } from "./merge-steps.ts";
import type { Step } from "./merge-steps.ts";
import { approvalTrailer } from "./merge-lint.ts";

interface BranchOptions {
  readonly approved?: string;
  readonly cwd: string;
  readonly ticket: number;
  readonly title: string;
}

function titleOf(options: Pick<BranchOptions, "ticket" | "title">): string {
  return `Merge ticket-${options.ticket}: ${options.title} (#${options.ticket})`;
}

function messageOf(options: BranchOptions): string {
  return `${titleOf(options)}${approvalTrailer(options.approved ?? "")}`;
}

function asOneTicketMerge(options: BranchOptions): Step {
  const ticket = git(options, "rev-parse", `ticket-${options.ticket}`).output;
  if (git(options, "rev-parse", "HEAD^2").output === ticket) {
    return DONE;
  }
  const flattened = git(options, "commit-tree", "HEAD^{tree}", "-p", "HEAD^2", "-p", ticket, "-m", messageOf(options));
  if (!flattened.ok) {
    return stop(`Could not rewrite the merge onto the new v1.\n${tail(flattened.output)}`);
  }
  return stepOf({ ran: git(options, "reset", "-q", flattened.output), what: "Moving onto the rewritten merge" });
}

function cleanTree(options: BranchOptions): Step {
  const status = git(options, "status", "--porcelain", "--untracked-files=no");
  if (status.ok && status.output === "") {
    return DONE;
  }
  return stop(`The working tree is not clean; commit first.\n${status.output}`);
}

export { cleanTree, asOneTicketMerge, messageOf, titleOf };
