import { FAILED, PASSED, commit, git, repo } from "./lib/hygiene-repo.ts";
import { expect, it } from "vitest";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = path.resolve("scripts/adr-numbers.ts");
const FIRST = "docs/adr/0002-the-first-ticket.md";
const SECOND = "docs/adr/0002-the-second-ticket.md";

function adrNumbers(dir: string): { readonly status: number | null; readonly stderr: string } {
  const run = spawnSync("node", [SCRIPT], { cwd: dir, encoding: "utf8" });
  return { status: run.status, stderr: run.stderr };
}

function branch(dir: string, name: string, adr: string): void {
  git(dir, "checkout", "-q", "-b", name, "v1");
  commit(dir, [adr, `# ${name}\n`]);
}

function twoTickets(): string {
  const dir = repo();
  commit(dir, ["docs/adr/0001-first.md", "# First\n"]);
  branch(dir, "ticket-1", FIRST);
  branch(dir, "ticket-2", SECOND);
  git(dir, "checkout", "-q", "--detach", "v1");
  git(dir, "merge", "-q", "--no-edit", "ticket-2");
  git(dir, "update-ref", "refs/remotes/origin/v1", "v1");
  return dir;
}

it("passes a pull request whose new ADR's number is still free on the latest v1", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  expect(adrNumbers(twoTickets())).toStrictEqual({ status: PASSED, stderr: "" });
});

it("fails the second of two pull requests adding the same ADR number once the first lands, naming the free number", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const dir = twoTickets();
  const landed = git(dir, "commit-tree", "ticket-1^{tree}", "-p", "v1", "-p", "ticket-1", "-m", "Merge ticket-1");
  git(dir, "update-ref", "refs/remotes/origin/v1", landed);
  const run = adrNumbers(dir);

  expect(run.status).toBe(FAILED);
  expect(run.stderr).toBe(
    `adr-numbers: ${SECOND} takes ADR number 0002, which origin/v1 already gives ${FIRST}. Renumber it to 0003, past origin/v1's highest, and fix every link to it.\n`,
  );
});
