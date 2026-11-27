import { expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Outcome } from "../lib/tools.ts";
import { browserShardPlan } from "../lib/timed-shards.ts";
import path from "node:path";
import { unitShardPlan } from "../lib/unit-shards.ts";

const DIR = "app/modules/routes/tests/browser";
const RUN = "900";
const RECORDED_RUN = 800;
const ASKED_AT = "2026-11-25T10:00:00Z";
const EARLIER = "2026-11-25T09:00:00Z";
const ARTIFACT = "test-timings-browser-1";
const ARTIFACT_ID = "7001";
const MS = 1000;
const NONE = 0;
const BUSY = `gh api repos/{owner}/{repo}/actions/artifacts/${ARTIFACT_ID}/zip failed: HTTP 503: No server is currently available`;
const MISSING = `gh api repos/{owner}/{repo}/actions/artifacts/${ARTIFACT_ID}/zip failed: HTTP 404: Not Found`;
const UNSPLIT = "can't read the recorded timings, and a split of its own would differ from the other shards'";
const ALWAYS = Number.POSITIVE_INFINITY;
const TWICE = 2;
const ONE = 1;
const THREE = 3;
const FIVE_SECONDS = 5000;
const ALPHA_SECONDS = 50;
const BRAVO_SECONDS = 40;

function file(name: string): string {
  return `${DIR}/${name}.browser.test.ts`;
}

const FILES = { ok: true, value: [file("alpha"), file("bravo")] } as const;

function report(): string {
  const suites = Object.entries({ alpha: ALPHA_SECONDS, bravo: BRAVO_SECONDS }).map(
    ([name, took]: readonly [string, number]) => ({
      file: `${name}.browser.test.ts`,
      specs: [{ tests: [{ results: [{ duration: took * MS }] }] }],
    }),
  );
  return JSON.stringify({ suites });
}

function gh(args: readonly string[]): Outcome<string> {
  const [, target = ""] = args;
  if (target.endsWith(`/runs/${RUN}`)) {
    return { ok: true, value: JSON.stringify({ created_at: ASKED_AT, id: Number(RUN) }) };
  }
  const artifact = {
    created_at: EARLIER,
    expired: false,
    id: Number(ARTIFACT_ID),
    name: ARTIFACT,
    workflow_run: { id: RECORDED_RUN },
  };
  return { ok: true, value: JSON.stringify({ artifacts: [artifact] }) };
}

function unpacked(dir: string, name: string, content: string): Outcome<string> {
  const timings = path.join(dir, ".timings");
  mkdirSync(timings, { recursive: true });
  writeFileSync(path.join(timings, name), content);
  return { ok: true, value: "" };
}

interface Flaky {
  readonly attempts: () => number;
  readonly download: (artifact: string, dir: string) => Outcome<string>;
}

function failingDownload(reason: string, failures: number): Flaky {
  let attempts = 0;
  return {
    attempts: () => attempts,
    download: (_artifact, dir) => {
      attempts += ONE;
      if (attempts <= failures) {
        return { ok: false, reason };
      }
      return unpacked(dir, "browser.json", report());
    },
  };
}

interface Waits {
  readonly sleep: (ms: number) => void;
  readonly waits: readonly number[];
}

function recordedWaits(): Waits {
  const waits: number[] = [];
  return {
    sleep: (ms) => {
      waits.push(ms);
    },
    waits,
  };
}

it("a CI shard retries the timings download after a 5xx, 5 s apart, and runs with the recorded times", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { attempts, download } = failingDownload(BUSY, TWICE);
  const { sleep, waits } = recordedWaits();

  expect([
    browserShardPlan({ download, files: FILES, gh, run: RUN, shard: "1/2", sleep }),
    attempts(),
    waits,
  ]).toStrictEqual([
    {
      args: ["--record-shard=1/2", file("alpha")],
      failure: "",
      line: "browser shard 1/2: 1 of 2 files, 50.0s of test time as run 800 recorded it",
    },
    THREE,
    [FIVE_SECONDS, FIVE_SECONDS],
  ]);
});

it("a CI shard whose timings download answers 5xx every time fails after 3 attempts, saying so", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { attempts, download } = failingDownload(BUSY, ALWAYS);
  const { sleep, waits } = recordedWaits();

  expect([
    browserShardPlan({ download, files: FILES, gh, run: RUN, shard: "2/2", sleep }),
    attempts(),
    waits,
  ]).toStrictEqual([
    { args: [], failure: `browser shard 2/2 ${UNSPLIT}: ${BUSY} (gave up after 3 attempts)`, line: "" },
    THREE,
    [FIVE_SECONDS, FIVE_SECONDS],
  ]);
});

it("a CI shard whose timings artifact is missing (404) fails at once", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { attempts, download } = failingDownload(MISSING, ALWAYS);
  const { sleep, waits } = recordedWaits();

  expect([
    browserShardPlan({ download, files: FILES, gh, run: RUN, shard: "2/2", sleep }),
    attempts(),
    waits,
  ]).toStrictEqual([{ args: [], failure: `browser shard 2/2 ${UNSPLIT}: ${MISSING}`, line: "" }, ONE, []]);
});

const CWD = "/home/runner/work/cookout/cookout";
const OLDER_ATTEMPT = "6003";
const NEWER_ATTEMPT = "6103";
interface Attempt {
  readonly createdAt: string;
  readonly seconds: number;
}

const ATTEMPTS: ReadonlyMap<string, Attempt> = new Map([
  [OLDER_ATTEMPT, { createdAt: "2026-11-25T08:00:00Z", seconds: 99 }],
  [NEWER_ATTEMPT, { createdAt: "2026-11-25T08:30:00Z", seconds: 30 }],
]);

function rerunCheck(args: readonly string[]): Outcome<string> {
  const [, target = ""] = args;
  if (target.endsWith(`/runs/${RUN}`)) {
    return { ok: true, value: JSON.stringify({ created_at: ASKED_AT, id: Number(RUN) }) };
  }
  const artifacts = [...ATTEMPTS].map(([artifact, { createdAt }]: readonly [string, Attempt]) => ({
    created_at: createdAt,
    expired: false,
    id: Number(artifact),
    name: "test-timings-tests-3",
    workflow_run: { id: RECORDED_RUN },
  }));
  return { ok: true, value: JSON.stringify({ artifacts }) };
}

interface Downloads {
  readonly download: (artifact: string, dir: string) => Outcome<string>;
  readonly downloaded: readonly string[];
}

function attemptDownloads(): Downloads {
  const downloaded: string[] = [];
  return {
    download: (artifact, dir) => {
      downloaded.push(artifact);
      const { seconds } = ATTEMPTS.get(artifact) ?? { seconds: NONE };
      const testResults = [{ endTime: seconds * MS, name: `${CWD}/a.test.ts`, startTime: 0 }];
      return unpacked(dir, "tests.json", JSON.stringify({ testResults }));
    },
    downloaded,
  };
}

it("a CI shard whose recorded run was re-run reads the newest of each artifact name, from the latest attempt, and runs", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { download, downloaded } = attemptDownloads();
  const files = { ok: true, value: ["a.test.ts"] } as const;

  expect([
    unitShardPlan({ cwd: CWD, download, files, gh: rerunCheck, run: RUN, shard: "1/1" }),
    downloaded,
  ]).toStrictEqual([
    {
      args: ["--outputFile.blob=.vitest/blob/blob-1-1.json", `${CWD}/a.test.ts`],
      failure: "",
      line: "unit shard 1/1: 1 of 1 files, 30.0s of test time as run 800 recorded it",
    },
    [NEWER_ATTEMPT],
  ]);
});
