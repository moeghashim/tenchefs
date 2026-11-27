import { COMPLETED, RUN, RUNNING, done, ended, fake, reasonOf, running, view } from "./lib/fake-gh.ts";
import { expect, it } from "vitest";

const ARGS = ["--branch", "v1", "--commit", "abc"];
const OTHER_URL = "https://github.com/o/r/actions/runs/41";
const NEWER = 43;
const OLDER = 41;
const WATCHED = 42;
const ONE_SLEEP = 1;
const TWO = 2;
const HEAD_SHA_CALL = 3;
const CANCELLED_RUN = view({
  jobs: [done("lint"), ended({ conclusion: "cancelled", failedStep: "pnpm check", name: "e2e-docker" })],
  status: COMPLETED,
});
const FAILED_RUN = view({
  jobs: [done("lint"), ended({ conclusion: "failure", failedStep: "pnpm check", name: "e2e-docker" })],
  status: COMPLETED,
});
const GREEN_RUN = view({ jobs: [done("lint"), done("e2e-docker")], status: COMPLETED });

function listed(run: number, status: string, conclusion: string): unknown {
  return { conclusion, databaseId: run, status, url: `https://github.com/o/r/actions/runs/${run}` };
}

function reruns(calls: readonly string[]): readonly string[] {
  return calls.filter((call) => call.startsWith("run rerun"));
}

it("passes a cancelled run when an older run on the same commit succeeded", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({
    list: [RUN, RUN, [listed(WATCHED, COMPLETED, "cancelled"), listed(OLDER, COMPLETED, "success")]],
    view: [CANCELLED_RUN],
  });

  const { logs, step } = gh.gate(ARGS);

  expect([reasonOf(step), logs]).toStrictEqual([
    "green",
    [`v1's Check run ${OLDER} on the same commit is green: ${OTHER_URL}`],
  ]);
  expect(gh.calls()).toContain(
    "run list --workflow Check --event push --json databaseId,status,conclusion,url --commit abc",
  );
});

it("passes a green run without asking about the cancelled one on the same commit", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [RUN, [listed(OLDER, COMPLETED, "cancelled")]], view: [GREEN_RUN] });

  const { calls, gate } = gh;

  expect([reasonOf(gate(ARGS).step), calls().length]).toStrictEqual(["green", TWO]);
});

it("passes a failed run when another run on the same commit succeeded", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [RUN, [listed(OLDER, COMPLETED, "success")]], view: [FAILED_RUN] });

  expect(reasonOf(gh.gate(ARGS).step)).toBe("green");
});

it("refuses a cancelled run when the other completed run on its commit failed", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [RUN, RUN, [listed(OLDER, COMPLETED, "failure")]], view: [CANCELLED_RUN, FAILED_RUN] });

  expect(reasonOf(gh.gate(ARGS).step)).toMatch(/^v1's latest Check run is red: e2e-docker \(failure\)/u);
  expect(gh.calls()).toContain(`run view ${OLDER} --json status,conclusion,url,jobs`);
});

it("watches a run still in progress on the same commit when the watched one failed", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({
    list: [RUN, [listed(NEWER, RUNNING, ""), listed(WATCHED, COMPLETED, "failure")]],
    view: [FAILED_RUN, view({ jobs: [running("e2e-docker")], status: RUNNING }), GREEN_RUN],
  });

  const { sleeps, step } = gh.gate(ARGS);

  expect([reasonOf(step), sleeps]).toStrictEqual(["green", TWO]);
  expect(gh.calls()).toContain(`run view ${NEWER} --json status,conclusion,url,jobs`);
});

it("reruns the newest run exactly once when every run on the commit was cancelled", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({
    list: [RUN, RUN, [listed(OLDER, COMPLETED, "cancelled")], [listed(OLDER, COMPLETED, "cancelled")]],
    rerun: [""],
    view: [CANCELLED_RUN, view({ jobs: [running("e2e-docker")], status: RUNNING }), GREEN_RUN],
  });

  const { logs, step } = gh.gate(ARGS);

  expect([reasonOf(step), reruns(gh.calls())]).toStrictEqual(["green", ["run rerun 42"]]);
  expect(logs).toContain("Every Check run on v1's commit was cancelled: rerunning the newest, run 42.");
});

it("refuses when the rerun is cancelled too, without rerunning again", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({
    list: [
      RUN,
      RUN,
      [listed(NEWER, COMPLETED, "cancelled")],
      [{ databaseId: NEWER }],
      [listed(WATCHED, COMPLETED, "cancelled")],
    ],
    rerun: [""],
    view: [CANCELLED_RUN],
  });

  const { step } = gh.gate(ARGS);

  expect([reasonOf(step), reruns(gh.calls())]).toStrictEqual([
    "v1's Check run 43 was cancelled again after its rerun, as was every other run on the same commit.",
    ["run rerun 43"],
  ]);
});

it("refuses when the rerun can't start", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({ list: [RUN, RUN, []], rerun: ["fail"], view: [CANCELLED_RUN] });

  expect(reasonOf(gh.gate(ARGS).step)).toBe("Could not rerun v1's cancelled Check run 42:\nHTTP 502");
});

it("keeps watching a run in progress whose only finished jobs were cancelled", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const cancelling = view({
    jobs: [running("lint"), ended({ conclusion: "cancelled", failedStep: "pnpm check", name: "e2e-docker" })],
    status: RUNNING,
  });
  const gh = fake({ list: [RUN, RUN, []], view: [cancelling, GREEN_RUN] });

  const { sleeps, step } = gh.gate(ARGS);

  expect([reasonOf(step), sleeps]).toStrictEqual(["green", ONE_SLEEP]);
});

it("finds the commit of a branch's latest run to judge a cancelled run", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const gh = fake({
    list: [RUN, RUN, [listed(OLDER, COMPLETED, "success")]],
    view: [CANCELLED_RUN, { headSha: "def" }],
  });

  expect([reasonOf(gh.gate(["--branch", "v1"]).step), gh.calls().at(HEAD_SHA_CALL)]).toStrictEqual([
    "green",
    "run view 42 --json headSha",
  ]);
});
