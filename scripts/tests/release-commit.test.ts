import { expect, it } from "vitest";
import type { Outcome } from "../lib/tools.ts";
import { releaseChoice } from "../lib/release-commit.ts";

const [NEWEST, RUNNING, RED, GREEN, OLDER] = ["aaaa1111", "bbbb2222", "cccc3333", "dddd4444", "eeee5555"];
const URL = "https://github.com/o/r/actions/runs/";

interface Stub {
  readonly conclusion: string;
  readonly sha: string;
  readonly status: string;
}

interface Stubbed {
  readonly ahead?: readonly string[];
  readonly commits: readonly string[];
  readonly runs: readonly unknown[];
}

function run({ conclusion, sha, status }: Stub): unknown {
  return { conclusion, headSha: sha, status, url: `${URL}${sha}` };
}

function done(sha: string, conclusion: string): unknown {
  return run({ conclusion, sha, status: "completed" });
}

function chosen({ ahead = [], commits, runs }: Stubbed): ReturnType<typeof releaseChoice> {
  return releaseChoice({
    gh: () => ({ ok: true, value: JSON.stringify(runs) }),
    git: (args): Outcome<string> => {
      if (args.includes("rev-list")) {
        return { ok: true, value: `${commits.join("\n")}\n` };
      }
      return { ok: true, value: ahead.join("\n") };
    },
  });
}

it("picks the newest green v1 commit over a newer red one and a newer one still running", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const choice = chosen({
    commits: [NEWEST, RUNNING, RED, GREEN, OLDER],
    runs: [
      done(NEWEST, "cancelled"),
      run({ conclusion: "", sha: RUNNING, status: "in_progress" }),
      done(RED, "failure"),
      done(GREEN, "failure"),
      done(GREEN, "success"),
      done(OLDER, "success"),
    ],
  });

  expect(choice).toStrictEqual({
    lines: [
      `skipped ${NEWEST}: its Check runs were all cancelled (${URL}${NEWEST})`,
      `skipped ${RUNNING}: its Check run is still running (${URL}${RUNNING})`,
      `skipped ${RED}: its Check run is red (${URL}${RED})`,
      `chose ${GREEN}: its Check run is green (${URL}${GREEN})`,
    ],
    outcome: { ok: true, value: GREEN },
  });
});

it("picks nothing, and says so, when no v1 commit has a green Check run", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(chosen({ commits: [NEWEST, RED], runs: [done(RED, "failure")] })).toStrictEqual({
    lines: [
      `skipped ${NEWEST}: it has no Check push run`,
      `skipped ${RED}: its Check run is red (${URL}${RED})`,
      "chose nothing: none of the newest 2 v1 commits has a green Check run",
    ],
    outcome: { ok: false, reason: "no v1 commit has a green Check run to release" },
  });
});

it("refuses to release when main has commits v1 lacks, naming them", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const choice = chosen({
    ahead: ["1234abcd Version Packages", "5678ef01 a hotfix"],
    commits: [GREEN],
    runs: [done(GREEN, "success")],
  });

  expect(choice.outcome).toStrictEqual({
    ok: false,
    reason: `main has 2 commits ${GREEN} lacks, so it can't fast-forward to it. Merge them into v1 first:\n1234abcd Version Packages\n5678ef01 a hotfix`,
  });
});

it("refuses when gh can't list the Check runs", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const offline = releaseChoice({
    gh: () => ({ ok: false, reason: "gh run list failed: offline" }),
    git: () => ({ ok: true, value: GREEN }),
  });

  expect(offline).toStrictEqual({ lines: [], outcome: { ok: false, reason: "gh run list failed: offline" } });
});
