import { field, list, parseJson, text } from "./json.ts";
import type { CheckRun } from "./check-run.ts";
import type { Command } from "./merge-steps.ts";
import { readCheckRun } from "./check-run.ts";
import { run } from "./merge-steps.ts";

interface Vouch {
  readonly branchPrefix: string;
  readonly cwd: string;
  readonly gh: Command;
  readonly runNumber: number;
}

interface Listed {
  readonly branch: string;
  readonly event: string;
  readonly runNumber: number;
}

interface Voucher {
  readonly branch: string;
  readonly checkRun: CheckRun;
  readonly kind: "vouched";
}

const NONE = 0;
const GREEN = "success";
const COMPLETED = "completed";
const UNVOUCHED = "unvouched";
const PUSH = "push";
const LIST = ["run", "list", "--workflow", "Check", "--json", "databaseId,headBranch,event"];

function ghJson(options: Vouch, args: readonly string[]): unknown {
  const ran = run(options.cwd, ...options.gh, ...args);
  if (!ran.ok) {
    return null;
  }
  return parseJson(ran.output);
}

function listedOf(value: unknown): readonly Listed[] {
  const branch = text(field(value, "headBranch"));
  const event = text(field(value, "event"));
  const runNumber = field(value, "databaseId");
  if (typeof branch !== "string" || typeof event !== "string" || typeof runNumber !== "number") {
    return [];
  }
  return [{ branch, event, runNumber }];
}

function headSha(options: Vouch): string {
  const viewed = ghJson(options, ["run", "view", String(options.runNumber), "--json", "headSha"]);
  return text(field(viewed, "headSha")) ?? "";
}

function voucherOf(options: Vouch, sha: string): Listed | typeof UNVOUCHED {
  const runs = list(ghJson(options, [...LIST, "--commit", sha])) ?? [];
  const found = runs
    .flatMap((value) => listedOf(value))
    .find(({ branch, event }) => event === PUSH && branch.startsWith(options.branchPrefix));
  return found ?? UNVOUCHED;
}

function isGreen(checkRun: CheckRun): boolean {
  return (
    checkRun.status === COMPLETED &&
    checkRun.jobs.length > NONE &&
    checkRun.jobs.every((job) => job.conclusion === GREEN)
  );
}

function vouchedGreen(options: Vouch): Voucher | typeof UNVOUCHED {
  const sha = headSha(options);
  if (sha === "") {
    return UNVOUCHED;
  }
  const voucher = voucherOf(options, sha);
  if (voucher === UNVOUCHED) {
    return UNVOUCHED;
  }
  const checkRun = readCheckRun({ ...options, runNumber: voucher.runNumber });
  if (checkRun.kind === "unreadable" || !isGreen(checkRun)) {
    return UNVOUCHED;
  }
  return { branch: voucher.branch, checkRun, kind: "vouched" };
}

export { UNVOUCHED, vouchedGreen };
