import { COMPLETED, RUN, URL, done, ended, fake, ranFor, reasonOf, view } from "./lib/fake-gh.ts";
import { expect, it } from "vitest";
import path from "node:path";
import { readFileSync } from "node:fs";

const WORKFLOW = `name: Check

jobs:
  check:
    name: \${{ matrix.job }}
    timeout-minutes: 5
  browser:
    name: browser \${{ matrix.shard }}/3
    timeout-minutes: 5
    steps:
      - name: pnpm check
  e2e-docker:
    timeout-minutes: 15
`;
const AT_LIMIT = 5;
const EARLY = 1;
const E2E_AT_LIMIT = 15;

function cancelledAfter(name: string, minutes: number): ReturnType<typeof ended> {
  return ranFor({ job: ended({ conclusion: "cancelled", failedStep: "pnpm check", name }), minutes });
}

it("names a job cut off at its time limit and does not rerun it", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({
    list: [RUN],
    view: [view({ jobs: [done("lint"), cancelledAfter("browser 2/3", AT_LIMIT)], status: COMPLETED })],
    workflow: WORKFLOW,
  });

  const { step } = gh.gate(["--commit", "abc"]);

  expect(step).toStrictEqual({
    cutOff: true,
    files: [],
    jobs: ["browser 2/3"],
    kind: "stopped",
    reason: `v1's latest Check run was cancelled: browser 2/3 was cut off at its time limit of 5 minutes. A rerun would hit the same limit, so it was not rerun.\n${URL}`,
  });
  expect(gh.calls().some((call) => call.startsWith("run rerun"))).toBe(false);
});

it("reads a job's limit by its key when the job has no name", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({
    list: [RUN],
    view: [view({ jobs: [cancelledAfter("e2e-docker", E2E_AT_LIMIT)], status: COMPLETED })],
    workflow: WORKFLOW,
  });

  expect(reasonOf(gh.gate(["--commit", "abc"]).step)).toContain(
    "e2e-docker was cut off at its time limit of 15 minutes",
  );
});

it("treats a job cancelled well before its limit as before", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({
    list: [RUN],
    view: [view({ jobs: [cancelledAfter("browser 2/3", EARLY)], status: COMPLETED })],
    workflow: WORKFLOW,
  });

  expect(reasonOf(gh.gate(["--branch", "v1"]).step)).toBe(
    `v1's latest Check run is red: browser 2/3 (cancelled).\n${URL}\nbrowser 2/3 failed steps: none named`,
  );
});

it("treats a cancelled job as before when there is no workflow to read its limit from", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({
    list: [RUN],
    view: [view({ jobs: [cancelledAfter("browser 2/3", AT_LIMIT)], status: COMPLETED })],
  });

  expect(reasonOf(gh.gate(["--branch", "v1"]).step)).toContain("is red: browser 2/3 (cancelled)");
});

it("reads each job's limit from the repo's own Check workflow", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const jobs = ["static", "tests 3/3", "coverage"].map((name) => cancelledAfter(name, AT_LIMIT));
  const gh = fake({
    list: [RUN],
    view: [view({ jobs, status: COMPLETED })],
    workflow: readFileSync(path.join(".github", "workflows", "check.yml"), "utf8"),
  });

  expect(reasonOf(gh.gate(["--commit", "abc"]).step)).toBe(
    `v1's latest Check run was cancelled: tests 3/3 was cut off at its time limit of 5 minutes; coverage was cut off at its time limit of 5 minutes. A rerun would hit the same limit, so it was not rerun.\n${URL}`,
  );
});
