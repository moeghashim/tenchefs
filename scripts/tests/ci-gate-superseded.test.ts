import {
  COMPLETED,
  NO_WAITS,
  POLLS,
  RUN,
  RUNNING,
  URL,
  done,
  ended,
  fake,
  reasonOf,
  running,
  view,
} from "./lib/fake-gh.ts";
import { expect, it } from "vitest";
import type { Responses } from "./lib/fake-gh.ts";

const MERGE_URL = "https://github.com/o/r/actions/runs/40";
const ON_COMMIT = [
  { databaseId: 42, event: "push", headBranch: "v1" },
  { databaseId: 40, event: "push", headBranch: "merge-ticket-7" },
];
const V1_RUNNING = view({ jobs: [done("lint"), running("e2e-docker")], status: RUNNING });
const HEAD = { headSha: "abc" };
const VOUCHED_BY = "merge-ticket-";

it("counts a v1 run still in progress as green when the same commit's merge-ticket run is green", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const gh = fake({
    list: [RUN, ON_COMMIT],
    view: [V1_RUNNING, HEAD, view({ jobs: [done("lint"), done("e2e-docker")], status: COMPLETED, url: MERGE_URL })],
    vouchedBy: VOUCHED_BY,
  });

  const { logs, sleeps, step } = gh.gate(["--branch", "v1"]);

  expect([step, sleeps, logs]).toStrictEqual([
    { kind: "done" },
    NO_WAITS,
    [
      `v1's latest Check run is still running or was cancelled, but merge-ticket-7's Check run on the same commit is green: ${MERGE_URL}`,
    ],
  ]);
  expect(gh.calls()).toStrictEqual([
    "run list --workflow Check --event push --limit 1 --json databaseId --branch v1",
    "run view 42 --json status,conclusion,url,jobs",
    "run view 42 --json headSha",
    "run list --workflow Check --json databaseId,headBranch,event --commit abc",
    "run view 40 --json status,conclusion,url,jobs",
  ]);
});

it.each<Responses & { readonly name: string }>([
  {
    list: [RUN, [{ databaseId: 42, event: "push", headBranch: "v1" }]],
    name: "the commit has no merge-ticket run",
    view: [V1_RUNNING, HEAD, V1_RUNNING],
  },
  {
    list: [RUN, ON_COMMIT],
    name: "the merge-ticket run is not green",
    view: [V1_RUNNING, HEAD, view({ jobs: [running("e2e-docker")], status: RUNNING }), V1_RUNNING],
  },
  {
    list: [RUN, [{ databaseId: 40, event: "pull_request", headBranch: "merge-ticket-7" }]],
    name: "the commit's only merge-ticket run is its pull request's",
    view: [V1_RUNNING, HEAD, V1_RUNNING],
  },
  {
    list: [RUN, [{ databaseId: 40, event: "merge_group", headBranch: "gh-readonly-queue/v1/pr-9-abc" }]],
    name: "the commit's only other run is a merge_group run",
    view: [V1_RUNNING, HEAD, V1_RUNNING],
  },
  { list: [RUN, ON_COMMIT], name: "the run's commit cannot be read", view: [V1_RUNNING, "fail", V1_RUNNING] },
  { list: [RUN, "fail"], name: "the commit's runs cannot be listed", view: [V1_RUNNING, HEAD, V1_RUNNING] },
])("waits for a v1 run still in progress when $name", { timeout: 10_000 }, (responses) => {
  expect.hasAssertions();

  const gh = fake({ ...responses, vouchedBy: VOUCHED_BY });

  const { sleeps, step } = gh.gate(["--branch", "v1"]);

  expect([reasonOf(step), sleeps]).toStrictEqual([
    `v1's latest Check run was still running after ${POLLS} waits: ${URL}`,
    POLLS,
  ]);
});

const NEWER_RUN = [{ databaseId: 43 }];
const FIRST_LOG = 0;
const CANCELLED = view({
  jobs: [done("lint"), ended({ conclusion: "cancelled", failedStep: "pnpm check", name: "browser" })],
  status: COMPLETED,
});

it("judges v1 by the newer run when a newer v1 push cancelled the run it was watching", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({
    list: [RUN, NEWER_RUN],
    view: [CANCELLED, view({ jobs: [done("lint"), done("browser")], status: COMPLETED })],
  });

  const { logs, step } = gh.gate(["--branch", "v1"]);

  expect([step, logs.at(FIRST_LOG)]).toStrictEqual([
    { kind: "done" },
    "v1's Check run 42 was cancelled by a newer run: reading run 43.",
  ]);
  expect(gh.calls()).toStrictEqual([
    "run list --workflow Check --event push --limit 1 --json databaseId --branch v1",
    "run view 42 --json status,conclusion,url,jobs",
    "run list --workflow Check --event push --limit 1 --json databaseId --branch v1",
    "run view 43 --json status,conclusion,url,jobs",
  ]);
});

it("refuses a cancelled run when no newer run replaced it", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [RUN], view: [CANCELLED] });

  expect(reasonOf(gh.gate(["--branch", "v1"]).step)).toBe(
    `v1's latest Check run is red: browser (cancelled).\n${URL}\nbrowser failed steps: none named`,
  );
});

it("passes a cancelled v1 run when the same commit's merge-ticket run is green", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({
    list: [ON_COMMIT],
    view: [CANCELLED, HEAD, view({ jobs: [done("lint"), done("browser")], status: COMPLETED, url: MERGE_URL })],
    vouchedBy: VOUCHED_BY,
  });

  const { logs, step } = gh.gate(["--branch", "v1"]);

  expect([step, logs]).toStrictEqual([
    { kind: "done" },
    [
      `v1's latest Check run is still running or was cancelled, but merge-ticket-7's Check run on the same commit is green: ${MERGE_URL}`,
    ],
  ]);
});
