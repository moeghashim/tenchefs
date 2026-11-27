import { COMPLETED, ONE_WAIT, POLLS, RUN, URL, done, ended, fake, reasonOf, view } from "./lib/fake-gh.ts";
import { expect, it } from "vitest";

const LOG_LINES = 20;
const LONG_LOG = Array.from({ length: 30 }, (_empty, line) => `e2e-docker\tpnpm e2e:docker\tline ${String(line)}`).join(
  "\n",
);

it("names a failed job's failed steps and the last 20 lines of its log", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({
    list: [RUN],
    log: [LONG_LOG],
    view: [
      view({
        jobs: [done("lint"), ended({ conclusion: "failure", failedStep: "pnpm e2e:docker", name: "e2e-docker" })],
        status: COMPLETED,
      }),
    ],
  });

  const { logs, step } = gh.gate(["--branch", "ticket-7", "--commit", "abc"]);

  expect([reasonOf(step), logs]).toStrictEqual([
    `v1's latest Check run is red: e2e-docker (failure).\n${URL}\ne2e-docker failed steps: pnpm e2e:docker\n${LONG_LOG.split("\n").slice(-LOG_LINES).join("\n")}`,
    ["lint: success", "e2e-docker: failure"],
  ]);
  expect(gh.calls()).toContain("run view 42 --job 7 --log-failed");
});

it("waits for a run that has not appeared yet, then watches it", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [[], RUN], view: [view({ jobs: [done("lint")], status: COMPLETED })] });

  const { logs, sleeps, step } = gh.gate(["--commit", "abc"], POLLS);

  expect([step, sleeps, logs]).toStrictEqual([
    { kind: "done" },
    ONE_WAIT,
    ["v1 has no Check push run yet: waiting (1 of 2).", "lint: success", `v1's latest Check run is green: ${URL}`],
  ]);
});

it("gives up on a run that never appears after the last wait", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [[]], view: [] });

  const { sleeps, step } = gh.gate(["--commit", "abc"], POLLS);

  expect([reasonOf(step), sleeps]).toStrictEqual([
    "v1 has no Check push run: run list --workflow Check --event push --limit 1 --json databaseId --commit abc",
    POLLS,
  ]);
});

it("warns but passes a job that failed only on a time budget", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({
    list: [RUN],
    log: ["lint\tpnpm check\t::warning title=lint over its time budget::lint took 20.1s, over its 16s budget."],
    view: [
      view({
        jobs: [ended({ conclusion: "failure", failedStep: "pnpm check", name: "lint" }), done("tests")],
        status: COMPLETED,
      }),
    ],
  });

  const { logs, step } = gh.gate(["--commit", "abc"]);

  expect([step, logs]).toStrictEqual([
    { kind: "done" },
    [
      "WARNING: lint failed only on a time budget, which never blocks (ADR 0030).",
      "lint: failure",
      "tests: success",
      `v1's latest Check run is green: ${URL}`,
    ],
  ]);
});

it("refuses a job whose log shows a failed check beside a time budget warning", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const log =
    "lint\tpnpm check\tFAIL lint (20.1s, budget 16s)\nlint\tpnpm check\tlint took 20.1s, over its 16s budget.";
  const gh = fake({
    list: [RUN],
    log: [log],
    view: [
      view({ jobs: [ended({ conclusion: "failure", failedStep: "pnpm check", name: "lint" })], status: COMPLETED }),
    ],
  });

  expect(reasonOf(gh.gate(["--commit", "abc"]).step)).toBe(
    `v1's latest Check run is red: lint (failure).\n${URL}\nlint failed steps: pnpm check\n${log}`,
  );
});
