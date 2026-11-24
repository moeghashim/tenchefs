import { COMPLETED, E2E_STEPS, RUN, RUNNING, URL, done, ended, fake, reasonOf, running, view } from "./lib/fake-gh.ts";
import { expect, it } from "vitest";

const ARGS = ["--branch", "merge-ticket-7", "--commit", "abc"];
const TWO = 2;
const FAILED_RUN = view({
  jobs: [done("lint"), ended({ conclusion: "failure", failedStep: "pnpm check", name: "e2e-docker" })],
  status: COMPLETED,
});
const RERUNNING = view({ jobs: [done("lint"), running("e2e-docker")], status: RUNNING });
const GREEN_RUN = view({ jobs: [done("lint"), done("e2e-docker")], status: COMPLETED });
const SKIPPED = { conclusion: "skipped", name: "coverage", status: COMPLETED, steps: [] };
const SKIPPED_AFTER_FAILURE = view({
  jobs: [ended({ conclusion: "failure", failedStep: "pnpm check", name: "e2e-docker" }), SKIPPED],
  status: COMPLETED,
});
const RERUN_LINE = "v1's Check run 42 is red: rerunning its failed jobs once, in case they were flaky: e2e-docker.";

function reruns(calls: readonly string[]): readonly string[] {
  return calls.filter((call) => call.startsWith("run rerun"));
}

it("reruns a red run's failed jobs once and passes when the rerun is green", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [RUN, []], rerun: [""], rerunRed: true, view: [FAILED_RUN, RERUNNING, GREEN_RUN] });

  const { logs, sleeps, step } = gh.gate(ARGS);

  expect([reasonOf(step), reruns(gh.calls()), sleeps]).toStrictEqual(["green", ["run rerun 42 --failed"], TWO]);
  expect(logs).toContain(RERUN_LINE);
});

it("refuses when the rerun is red too, naming the failed jobs, without rerunning again", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [RUN, []], rerun: [""], rerunRed: true, view: [FAILED_RUN, RERUNNING, FAILED_RUN] });

  const { step } = gh.gate(ARGS);

  expect([reasonOf(step), reruns(gh.calls())]).toStrictEqual([
    `v1's latest Check run is red: e2e-docker (failure).\n${URL}${E2E_STEPS}\nIts failed jobs were rerun once and failed again.`,
    ["run rerun 42 --failed"],
  ]);
  expect(step).toMatchObject({ jobs: ["e2e-docker"] });
});

it("waits for a red run to finish before rerunning its failed jobs", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const failing = view({
    jobs: [running("lint"), ended({ conclusion: "failure", failedStep: "pnpm check", name: "e2e-docker" })],
    status: RUNNING,
  });
  const gh = fake({ list: [RUN, []], rerun: [""], rerunRed: true, view: [failing, FAILED_RUN, GREEN_RUN] });

  const { sleeps, step } = gh.gate(ARGS);

  expect([reasonOf(step), reruns(gh.calls()), sleeps]).toStrictEqual(["green", ["run rerun 42 --failed"], TWO]);
});

it("refuses, naming the red run, when its failed jobs cannot be rerun", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [RUN, []], rerun: ["fail"], rerunRed: true, view: [FAILED_RUN] });

  const { step } = gh.gate(ARGS);

  expect(reasonOf(step)).toBe(
    `v1's latest Check run is red: e2e-docker (failure).\n${URL}${E2E_STEPS}\nCould not rerun its failed jobs: gh run rerun 42 --failed\nHTTP 502`,
  );
  expect(step).toMatchObject({ jobs: ["e2e-docker"] });
});

it("refuses a red run without rerunning it when not asked to", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [RUN, []], rerun: [""], view: [FAILED_RUN, GREEN_RUN] });

  expect([reasonOf(gh.gate(ARGS).step), reruns(gh.calls())]).toStrictEqual([
    `v1's latest Check run is red: e2e-docker (failure).\n${URL}${E2E_STEPS}`,
    [],
  ]);
});

it("names only the failed job, not one skipped because it depended on it", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [RUN, []], view: [SKIPPED_AFTER_FAILURE] });

  const { step } = gh.gate(ARGS);

  expect(reasonOf(step)).toBe(`v1's latest Check run is red: e2e-docker (failure).\n${URL}${E2E_STEPS}`);
  expect(step).toMatchObject({ jobs: ["e2e-docker"] });
});

it("waits for the rerun while a job skipped on the red attempt still reads as skipped", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const rerunning = view({ jobs: [running("e2e-docker"), SKIPPED], status: RUNNING });
  const gh = fake({
    list: [RUN, []],
    rerun: [""],
    rerunRed: true,
    view: [SKIPPED_AFTER_FAILURE, rerunning, GREEN_RUN],
  });

  const { sleeps, step } = gh.gate(ARGS);

  expect([reasonOf(step), reruns(gh.calls()), sleeps]).toStrictEqual(["green", ["run rerun 42 --failed"], TWO]);
});
