import { expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Outcome } from "../lib/tools.ts";
import type { Planning } from "../lib/timed-shards.ts";
import { browserShardPlan } from "../lib/timed-shards.ts";
import path from "node:path";
import { unitShardPlan } from "../lib/unit-shards.ts";

const DIR = "app/modules/routes/tests/browser";
const RUN = "900";
const ASKED_AT = "2026-11-25T10:00:00Z";
const EARLIER = "2026-11-25T09:00:00Z";
const LATER = "2026-11-25T10:05:00Z";
const MS = 1000;
const FIRST_ID = 1;
const TARGET = 1;

interface ArtifactAt {
  readonly createdAt: string;
  readonly expired?: boolean;
  readonly name: string;
  readonly run: number;
}

type Seconds = Readonly<Record<string, number>>;

function file(name: string): string {
  return `${DIR}/${name}.browser.test.ts`;
}

function reportOf(seconds: Seconds): string {
  const suites = Object.entries(seconds).map(([name, took]: readonly [string, number]) => ({
    file: `${name}.browser.test.ts`,
    specs: [{ tests: [{ results: [{ duration: took * MS }] }] }],
  }));
  return JSON.stringify({ suites });
}

function listing(artifacts: readonly ArtifactAt[]): string {
  return JSON.stringify({
    artifacts: artifacts.map(({ createdAt, expired = false, name, run }, index) => ({
      created_at: createdAt,
      expired,
      id: index + FIRST_ID,
      name,
      workflow_run: { id: run },
    })),
  });
}

interface FakeCi {
  readonly artifacts: readonly ArtifactAt[];
  readonly reports: Readonly<Record<string, Seconds>>;
}

const CWD = "/home/runner/work/cookout/cookout";

function unitReportOf(seconds: Seconds): string {
  const testResults = Object.entries(seconds).map(([name, took]: readonly [string, number]) => ({
    endTime: took * MS,
    name: `${CWD}/${name}.test.ts`,
    startTime: 0,
  }));
  return JSON.stringify({ testResults });
}

function reportFor(name: string, seconds: Seconds): readonly [string, string] {
  if (name.startsWith("test-timings-tests-")) {
    return ["tests.json", unitReportOf(seconds)];
  }
  return ["browser.json", reportOf(seconds)];
}

function unpacked(into: string, reports: FakeCi["reports"]): Outcome<string> {
  const name = path.basename(into);
  const [report, content] = reportFor(name, reports[name] ?? {});
  mkdirSync(path.join(into, ".timings"), { recursive: true });
  writeFileSync(path.join(into, ".timings", report), content);
  return { ok: true, value: "" };
}

function runIn(target: string): string {
  const [, run = ""] = /\/runs\/(?<run>\d+)\/artifacts/v.exec(target) ?? [];
  return run;
}

function nameIn(target: string): string {
  const [, name = ""] = /name=(?<name>[^&]+)/v.exec(target) ?? [];
  return name;
}

function listed(target: string, artifact: ArtifactAt): boolean {
  const run = runIn(target);
  if (run !== "") {
    return String(artifact.run) === run;
  }
  return artifact.name === nameIn(target);
}

function api(target: string, artifacts: FakeCi["artifacts"]): Outcome<string> {
  if (target.endsWith(`/runs/${RUN}`)) {
    return { ok: true, value: JSON.stringify({ created_at: ASKED_AT, id: Number(RUN) }) };
  }
  return { ok: true, value: listing(artifacts.filter((artifact) => listed(target, artifact))) };
}

type Ci = Required<Pick<Planning, "download" | "gh">>;

function fakeCi({ artifacts, reports }: FakeCi): Ci {
  return {
    download: (_artifact, dir) => unpacked(dir, reports),
    gh: (args) => api(args[TARGET] ?? "", artifacts),
  };
}

function offline(): Outcome<string> {
  return { ok: false, reason: "gh api failed: offline" };
}

const FILES = ["alpha", "bravo", "charlie", "delta", "echo"].map((name) => file(name));

function recordedBy(reports: FakeCi["reports"]): Ci {
  const artifacts = Object.keys(reports).map((name) => ({ createdAt: EARLIER, name, run: 800 }));
  return fakeCi({ artifacts, reports });
}

const downloadFails: Ci = {
  download: () => ({ ok: false, reason: "gh api repos/{owner}/{repo}/actions/artifacts/7001/zip failed: HTTP 404" }),
  gh: recordedBy({ "test-timings-browser-1": { alpha: 50, bravo: 40 } }).gh,
};

function planned(shard: string, reports: FakeCi["reports"], files: readonly string[] = FILES): readonly string[] {
  return browserShardPlan({ ...recordedBy(reports), files: { ok: true, value: files }, run: RUN, shard }).args;
}

it("counts a file with no recorded time as the average file, and adds up a file's times across reports", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const reports = {
    "test-timings-browser-1": { alpha: 30, bravo: 20 },
    "test-timings-browser-2": { alpha: 30, gone: 500 },
  };
  const files = [file("alpha"), file("bravo"), file("new")];

  expect(["1/2", "2/2"].map((shard) => planned(shard, reports, files))).toStrictEqual([
    ["--record-shard=1/2", file("alpha")],
    ["--record-shard=2/2", file("bravo"), file("new")],
  ]);
});

it("splits by test count when no browser test file has a recorded time, or the shard isn't one", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  expect([
    browserShardPlan({
      files: { ok: true, value: FILES },
      ...recordedBy({ "test-timings-browser-1": { gone: 5 } }),
      run: RUN,
      shard: "1/2",
    }).line,
    browserShardPlan({
      files: { ok: true, value: FILES },
      ...recordedBy({ "test-timings-browser-1": { alpha: 5 } }),
      run: RUN,
      shard: "3/2",
    }).line,
  ]).toStrictEqual([
    "browser shard 1/2: split by test count, since no browser test file has a recorded time",
    "browser shard 3/2: split by test count, since 3/2 isn't a shard such as 1/3",
  ]);
});

it("a CI shard runs the files its share of the time recorded before its run picks, labelling its coverage map", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const ci = fakeCi({
    artifacts: [
      { createdAt: LATER, name: "test-timings-browser-1", run: 899 },
      { createdAt: EARLIER, name: "test-timings-browser-1", run: 800 },
      { createdAt: EARLIER, expired: true, name: "test-timings-browser-1", run: 850 },
      { createdAt: EARLIER, name: "test-timings-browser-2", run: 800 },
      { createdAt: LATER, name: "test-timings-browser-3", run: 800 },
      { createdAt: EARLIER, name: "test-timings-tests-1", run: 800 },
    ],
    reports: {
      "test-timings-browser-1": { alpha: 50, bravo: 40 },
      "test-timings-browser-2": { charlie: 30, delta: 20, echo: 10 },
      "test-timings-browser-3": { echo: 1000 },
    },
  });

  expect(
    ["1/2", "2/2"].map((shard) => browserShardPlan({ ...ci, files: { ok: true, value: FILES }, run: RUN, shard })),
  ).toStrictEqual([
    {
      args: ["--record-shard=1/2", file("alpha"), file("delta"), file("echo")],
      failure: "",
      line: "browser shard 1/2: 3 of 5 files, 80.0s of test time as run 800 recorded it",
    },
    {
      args: ["--record-shard=2/2", file("bravo"), file("charlie")],
      failure: "",
      line: "browser shard 2/2: 2 of 5 files, 70.0s of test time as run 800 recorded it",
    },
  ]);
});

it("a CI shard falls back to Playwright's split by test count when no run recorded times", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const files = { ok: true, value: FILES } as const;
  const none = fakeCi({ artifacts: [{ createdAt: LATER, name: "test-timings-browser-1", run: 899 }], reports: {} });

  expect([
    browserShardPlan({ files, ...none, run: RUN, shard: "1/3" }).line,
    browserShardPlan({ files, ...none, run: "", shard: "1/3" }).line,
    browserShardPlan({ files: { ok: false, reason: "no listing" }, ...none, run: RUN, shard: "2/3" }),
  ]).toStrictEqual([
    "browser shard 1/3: split by test count, since no Check run recorded browser timings before run 900",
    "browser shard 1/3: split by test count, since this isn't a GitHub Actions run",
    { args: ["--shard=2/3"], failure: "", line: "browser shard 2/3: split by test count, since no listing" },
  ]);
});

it("a CI shard that can't read the recorded times fails rather than split on its own", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const files = { ok: true, value: FILES } as const;
  const unsplit = "can't read the recorded timings, and a split of its own would differ from the other shards'";

  expect([
    browserShardPlan({ files, gh: offline, run: RUN, shard: "1/3" }),
    browserShardPlan({ files, ...downloadFails, run: RUN, shard: "2/3" }),
  ]).toStrictEqual([
    { args: [], failure: `browser shard 1/3 ${unsplit}: gh api failed: offline`, line: "" },
    {
      args: [],
      failure: `browser shard 2/3 ${unsplit}: gh api repos/{owner}/{repo}/actions/artifacts/7001/zip failed: HTTP 404`,
      line: "",
    },
  ]);
});

it("a CI unit-test shard runs, by absolute path, the files its share of the recorded time picks, naming its blob", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const ci = fakeCi({
    artifacts: [
      { createdAt: EARLIER, name: "test-timings-tests-1", run: 800 },
      { createdAt: EARLIER, name: "test-timings-tests-2", run: 800 },
      { createdAt: EARLIER, name: "test-timings-browser-1", run: 800 },
    ],
    reports: {
      "test-timings-browser-1": { alpha: 500 },
      "test-timings-tests-1": { "a/alpha": 50, "a/bravo": 40 },
      "test-timings-tests-2": { "b/charlie": 30, "b/delta": 20 },
    },
  });
  const files = {
    ok: true,
    value: ["a/alpha", "a/bravo", "b/charlie", "b/delta"].map((name) => `${name}.test.ts`),
  } as const;

  expect(["1/2", "2/2"].map((shard) => unitShardPlan({ ...ci, cwd: CWD, files, run: RUN, shard }))).toStrictEqual([
    {
      args: ["--outputFile.blob=.vitest/blob/blob-1-2.json", `${CWD}/a/alpha.test.ts`, `${CWD}/b/delta.test.ts`],
      failure: "",
      line: "unit shard 1/2: 2 of 4 files, 70.0s of test time as run 800 recorded it",
    },
    {
      args: ["--outputFile.blob=.vitest/blob/blob-2-2.json", `${CWD}/a/bravo.test.ts`, `${CWD}/b/charlie.test.ts`],
      failure: "",
      line: "unit shard 2/2: 2 of 4 files, 70.0s of test time as run 800 recorded it",
    },
  ]);
});

it("a CI unit-test shard falls back to Vitest's split by file count when no run recorded unit-test timings", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const ci = fakeCi({ artifacts: [{ createdAt: EARLIER, name: "test-timings-browser-1", run: 800 }], reports: {} });

  expect(unitShardPlan({ ...ci, cwd: CWD, files: { ok: true, value: FILES }, run: RUN, shard: "4/6" })).toStrictEqual({
    args: ["--shard=4/6"],
    failure: "",
    line: "unit shard 4/6: split by file count, since no Check run recorded unit timings before run 900",
  });
});
