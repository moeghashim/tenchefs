import {
  COMPLETED,
  E2E_STEPS,
  NO_WAITS,
  ONE_WAIT,
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

it("passes when the latest Check run has every job green", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [RUN], view: [view({ jobs: [done("lint"), done("e2e-docker")], status: COMPLETED })] });

  const { logs, step } = gh.gate(["--branch", "v1"]);

  expect([step, logs]).toStrictEqual([
    { kind: "done" },
    ["lint: success", "e2e-docker: success", `v1's latest Check run is green: ${URL}`],
  ]);
  expect(gh.calls()).toStrictEqual([
    "run list --workflow Check --event push --limit 1 --json databaseId --branch v1",
    "run view 42 --json status,conclusion,url,jobs",
  ]);
});

it("refuses a red run, naming the failing jobs and the run", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({
    list: [RUN],
    view: [
      view({
        jobs: [done("lint"), ended({ conclusion: "failure", failedStep: "pnpm check", name: "e2e-docker" })],
        status: COMPLETED,
      }),
    ],
  });

  expect(reasonOf(gh.gate(["--branch", "v1"]).step)).toBe(
    `v1's latest Check run is red: e2e-docker (failure).\n${URL}${E2E_STEPS}`,
  );
});

it("counts a skipped job as not green", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({
    list: [RUN],
    view: [
      view({
        jobs: [done("check"), ended({ conclusion: "skipped", failedStep: "pnpm check", name: "e2e-docker" })],
        status: COMPLETED,
      }),
    ],
  });

  expect(reasonOf(gh.gate(["--branch", "ticket-7", "--commit", "abc"]).step)).toBe(
    `v1's latest Check run is red: e2e-docker (skipped).\n${URL}\ne2e-docker failed steps: none named`,
  );
});

it("refuses a finished run with no jobs", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [RUN], view: [view({ jobs: [], status: COMPLETED })] });

  expect(reasonOf(gh.gate(["--branch", "v1"]).step)).toBe(`v1's latest Check run is red: the run (no jobs).\n${URL}`);
});

it("waits for a run still in progress, then passes once it is green", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({
    list: [RUN],
    view: [
      view({ jobs: [done("lint"), running("e2e-docker")], status: RUNNING }),
      view({ jobs: [done("lint"), done("e2e-docker")], status: COMPLETED }),
    ],
  });

  const { sleeps, step } = gh.gate(["--branch", "v1"]);

  expect([step, sleeps]).toStrictEqual([{ kind: "done" }, ONE_WAIT]);
});

it("refuses a run in progress as soon as one of its jobs has failed", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({
    list: [RUN],
    view: [
      view({
        jobs: [ended({ conclusion: "failure", failedStep: "pnpm check", name: "e2e-docker" }), running("lint")],
        status: RUNNING,
      }),
    ],
  });

  const { sleeps, step } = gh.gate(["--branch", "v1"]);

  expect([reasonOf(step), sleeps]).toStrictEqual([
    `v1's latest Check run is red: e2e-docker (failure).\n${URL}${E2E_STEPS}`,
    NO_WAITS,
  ]);
});

it("gives up on a run still in progress after the last wait", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [RUN], view: [view({ jobs: [running("e2e-docker")], status: RUNNING })] });

  const { sleeps, step } = gh.gate(["--branch", "v1"]);

  expect([reasonOf(step), sleeps]).toStrictEqual([
    `v1's latest Check run was still running after ${POLLS} waits: ${URL}`,
    POLLS,
  ]);
});

it("refuses when there is no Check run to read", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [[]], view: [] });

  expect(reasonOf(gh.gate(["--branch", "ticket-7", "--commit", "abc"]).step)).toBe(
    "v1 has no Check push run: run list --workflow Check --event push --limit 1 --json databaseId --branch ticket-7 --commit abc",
  );
});

it.each<Responses & { readonly name: string }>([
  { list: ["fail"], name: "listing runs fails", view: [] },
  { list: [RUN], name: "reading the run fails", view: ["fail"] },
  { list: [{}], name: "listing runs returns no list", view: [] },
  { list: [RUN], name: "reading the run returns no jobs", view: [{ status: COMPLETED }] },
])("refuses when $name", { timeout: 10_000 }, (responses) => {
  expect.hasAssertions();

  const gh = fake(responses);

  expect(reasonOf(gh.gate(["--branch", "v1"]).step)).toMatch(/^Could not read v1's Check run: gh run /u);
});

it("reads the merge queue's run when asked for merge_group runs", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({
    event: "merge_group",
    list: [RUN],
    view: [view({ jobs: [done("lint"), done("checked")], status: COMPLETED })],
  });

  const { step } = gh.gate(["--branch", "gh-readonly-queue/v1/pr-9-abc"]);

  expect([step, gh.calls()]).toStrictEqual([
    { kind: "done" },
    [
      "run list --workflow Check --event merge_group --limit 1 --json databaseId --branch gh-readonly-queue/v1/pr-9-abc",
      "run view 42 --json status,conclusion,url,jobs",
    ],
  ]);
});

it("says it waits for a merge_group run, not a push run, while the queue's run hasn't started", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const gh = fake({ event: "merge_group", list: [[]], view: [] });

  expect(reasonOf(gh.gate(["--branch", "gh-readonly-queue/v1/pr-9-abc"]).step)).toBe(
    "v1 has no Check merge_group run: run list --workflow Check --event merge_group --limit 1 --json databaseId --branch gh-readonly-queue/v1/pr-9-abc",
  );
});
