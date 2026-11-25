import { field, list, parseJson, text } from "./json.ts";
import type { Outcome } from "./tools.ts";
import { spawnSync } from "node:child_process";

type Gh = (args: readonly string[]) => Outcome<string>;

interface Asking {
  readonly asked: boolean;
  readonly cwd: string;
  readonly gh: Gh;
}

interface CiGreen {
  readonly line: string;
  readonly skip: boolean;
}

const EXIT_SUCCESS = 0;
const RUN_EVERYTHING: CiGreen = { line: "", skip: false };
const GREEN = "success";

function git(cwd: string, args: readonly string[]): Outcome<string> {
  const ran = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (ran.status !== EXIT_SUCCESS) {
    return { ok: false, reason: ran.stderr };
  }
  return { ok: true, value: ran.stdout.trim() };
}

function unasked(reason: string): CiGreen {
  const [first = ""] = reason.trim().split("\n");
  return { line: `check: running everything, since gh could not say whether CI passed HEAD (${first}).`, skip: false };
}

function greenUrl(listing: string): Outcome<string> {
  const runs = list(parseJson(listing)) ?? null;
  if (runs === null) {
    return { ok: false, reason: "gh printed no list of runs" };
  }
  const green = runs.find((run) => text(field(run, "conclusion")) === GREEN);
  return { ok: true, value: text(field(green, "url")) ?? "" };
}

function cleanHead(cwd: string): string {
  const status = git(cwd, ["status", "--porcelain"]);
  const head = git(cwd, ["rev-parse", "HEAD"]);
  if (!status.ok || status.value !== "" || !head.ok) {
    return "";
  }
  return head.value;
}

function runsAt(gh: Gh, head: string): Outcome<string> {
  const listed = gh([
    "run",
    "list",
    "--workflow",
    "Check",
    "--event",
    "push",
    "--commit",
    head,
    "--json",
    "conclusion,url",
  ]);
  if (!listed.ok) {
    return listed;
  }
  return greenUrl(listed.value);
}

function ciGreenAtHead({ asked, cwd, gh }: Asking): CiGreen {
  const head = cleanHead(cwd);
  if (!asked || head === "") {
    return RUN_EVERYTHING;
  }
  const url = runsAt(gh, head);
  if (!url.ok) {
    return unasked(url.reason);
  }
  if (url.value === "") {
    return RUN_EVERYTHING;
  }
  return { line: `RESULT: PASS (CI green at HEAD ${url.value})`, skip: true };
}

export { ciGreenAtHead };
