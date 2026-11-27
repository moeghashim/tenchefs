import { expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import type { Outcome } from "../lib/tools.ts";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { versionOnChosen } from "../lib/release-version.ts";

const EXIT_SUCCESS = 0;
const CHOSEN_SHA = "0123456789abcdef0123456789abcdef01234567";
const RELEASE_YML = ".github/workflows/release.yml";

interface Repo {
  readonly chosen: string;
  readonly directory: string;
  readonly git: (args: readonly string[]) => Outcome<string>;
}

function gitIn(directory: string): (args: readonly string[]) => Outcome<string> {
  return (args) => {
    const ran = spawnSync("git", ["-C", directory, ...args], { encoding: "utf8" });
    if (ran.status !== EXIT_SUCCESS) {
      return { ok: false, reason: `git ${args.join(" ")} failed: ${ran.stderr.trim()}` };
    }
    return { ok: true, value: ran.stdout.trim() };
  };
}

function commit(directory: string, message: string): string {
  const git = ["-C", directory, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"];
  spawnSync("git", [...git, "add", "-A"]);
  spawnSync("git", [...git, "commit", "-q", "-m", message]);
  return spawnSync("git", ["-C", directory, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
}

function changesetsIn(directory: string): readonly string[] {
  return readdirSync(path.join(directory, ".changeset")).toSorted();
}

function branchAtTriggering(): Repo {
  const directory = mkdtempSync(path.join(tmpdir(), "release-version-"));
  spawnSync("git", ["-C", directory, "init", "-q", "-b", "v1"]);
  mkdirSync(path.join(directory, ".changeset"));
  writeFileSync(path.join(directory, ".changeset", "README.md"), "# Changesets\n");
  const triggering = commit(directory, "Merge #895");
  writeFileSync(
    path.join(directory, ".changeset", "login-approve.md"),
    "---\n'@ai-hero/cookout': patch\n---\n\nlogin approve\n",
  );
  const chosen = commit(directory, "Merge #879");
  spawnSync("git", ["-C", directory, "checkout", "-q", "-b", "changeset-release/v1", triggering]);
  writeFileSync(path.join(directory, ".changeset", "unreleased-work.md"), "---\n'@ai-hero/cookout': patch\n---\n");
  return { chosen, directory, git: gitIn(directory) };
}

it("runs version on the chosen commit when the run was triggered by an older one", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { chosen, directory, git } = branchAtTriggering();
  const seen: (readonly string[])[] = [];
  const outcome = versionOnChosen({
    git,
    sha: chosen,
    version: () => {
      seen.push(changesetsIn(directory));
      return { ok: true, value: "" };
    },
  });

  expect({ head: git(["rev-parse", "HEAD"]), outcome, seen }).toStrictEqual({
    head: { ok: true, value: chosen },
    outcome: { ok: true, value: `ran version on ${chosen}` },
    seen: [["README.md", "login-approve.md", "unreleased-work.md"]],
  });
});

it("refuses a chosen commit that isn't a full SHA, before touching the tree", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const calls: string[] = [];
  const outcome = versionOnChosen({
    git: (args) => {
      calls.push(args.join(" "));
      return { ok: true, value: "" };
    },
    sha: "",
    version: () => ({ ok: true, value: "" }),
  });

  expect({ calls, outcome }).toStrictEqual({
    calls: [],
    outcome: { ok: false, reason: `the chosen commit "" isn't a full SHA: pass the choose job's sha output` },
  });
});

it("doesn't run version when the reset to the chosen commit fails", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const versioned: string[] = [];
  const outcome = versionOnChosen({
    git: () => ({ ok: false, reason: "git reset failed" }),
    sha: CHOSEN_SHA,
    version: () => {
      versioned.push("version");
      return { ok: true, value: "" };
    },
  });

  expect({ outcome, versioned }).toStrictEqual({ outcome: { ok: false, reason: "git reset failed" }, versioned: [] });
});

it("passes on a failing version command's reason", { timeout: 10_000 }, () => {
  expect.hasAssertions();
  expect(
    versionOnChosen({
      git: () => ({ ok: true, value: "" }),
      sha: CHOSEN_SHA,
      version: () => ({ ok: false, reason: "No unreleased changesets found." }),
    }),
  ).toStrictEqual({ ok: false, reason: "No unreleased changesets found." });
});

it("the Release workflow's changesets step versions the chosen commit, not github.sha", { timeout: 10_000 }, () => {
  expect.hasAssertions();
  expect(readFileSync(RELEASE_YML, "utf8")).toContain(
    `          version: node scripts/release-version.ts \${{ needs.choose.outputs.sha }}\n`,
  );
});
