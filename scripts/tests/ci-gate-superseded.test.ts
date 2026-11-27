import { COMPLETED, RUN, URL, done, ended, fake, reasonOf, view } from "./lib/fake-gh.ts";
import { expect, it } from "vitest";

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
