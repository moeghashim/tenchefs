import type { Outcome } from "./tools.ts";
import { spawnSync } from "node:child_process";

interface Diff {
  readonly base: string;
  readonly cwd: string;
}

interface DocsOnly {
  readonly line: string;
  readonly skip: boolean;
}

const EXIT_SUCCESS = 0;
const NONE = 0;
const RUN_EVERYTHING: DocsOnly = { line: "", skip: false };
const SKIP_LINE =
  "check: skipping the tests and browser jobs, since every changed file is docs (*.md, docs/, .changeset/). CI still runs them.";

function listed(cwd: string, args: readonly string[]): Outcome<readonly string[]> {
  const ran = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (ran.status !== EXIT_SUCCESS) {
    return { ok: false, reason: ran.stderr };
  }
  return { ok: true, value: ran.stdout.split("\n").filter((file) => file !== "") };
}

function isDocs(file: string): boolean {
  return file.endsWith(".md") || file.startsWith("docs/") || file.startsWith(".changeset/");
}

function docsOnlySkip({ base, cwd }: Diff): DocsOnly {
  const diffed = listed(cwd, ["diff", "--name-only", "--merge-base", base]);
  const untracked = listed(cwd, ["ls-files", "--others", "--exclude-standard"]);
  if (!diffed.ok || !untracked.ok) {
    return RUN_EVERYTHING;
  }
  const changed = [...diffed.value, ...untracked.value];
  if (changed.length === NONE || !changed.every((file) => isDocs(file))) {
    return RUN_EVERYTHING;
  }
  return { line: SKIP_LINE, skip: true };
}

export { docsOnlySkip };
