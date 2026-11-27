import type { Outcome, Run } from "../lib/tools.ts";
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { releasePlan } from "../lib/release-publish.ts";

const RELEASE_YML = ".github/workflows/release.yml";
const VERSION = "0.11.0";
const PENDING = ["moved-message.md"];
const UNPUBLISHED: Run = { status: 0, stderr: "", stdout: "" };
const DECIDE = `        id: publish\n        run: node scripts/release-publish.ts --ci >> "$GITHUB_OUTPUT"\n`;
const PUBLISH =
  "      - name: Publish to npm\n        if: steps.publish.outputs.publish == 'true'\n        run: pnpm release\n";
const STEP = "      - name: ";
const ORDER = ["Decide whether to publish", "Publish to npm", "Open or update the Version Packages pull request"];
const PUBLISHED: Run = { status: 0, stderr: "", stdout: `${VERSION}\n` };

function npmAnswering(run: Run): (args: readonly string[]) => Outcome<Run> {
  return () => ({ ok: true, value: run });
}

it("publishes an unpublished version and opens Version Packages when a changeset landed after the Version Packages merge", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();
  expect(releasePlan({ ci: true, npm: npmAnswering(UNPUBLISHED), pending: PENDING, version: VERSION })).toStrictEqual({
    ok: true,
    value: {
      lines: [
        "publish @ai-hero/cookout@0.11.0 to npm",
        "open or update the Version Packages pull request against v1 from 1 changesets",
      ],
      publish: true,
      versionPackages: true,
    },
  });
});

it("publishes an unpublished version with no changesets pending", { timeout: 10_000 }, () => {
  expect.hasAssertions();
  expect(releasePlan({ ci: true, npm: npmAnswering(UNPUBLISHED), pending: [], version: VERSION })).toStrictEqual({
    ok: true,
    value: {
      lines: ["publish @ai-hero/cookout@0.11.0 to npm", "leave Version Packages alone: no changesets are pending"],
      publish: true,
      versionPackages: false,
    },
  });
});

it("never publishes a version that is already on npm", { timeout: 10_000 }, () => {
  expect.hasAssertions();
  expect(releasePlan({ ci: true, npm: npmAnswering(PUBLISHED), pending: PENDING, version: VERSION })).toStrictEqual({
    ok: true,
    value: {
      lines: [
        "publish nothing to npm: @ai-hero/cookout@0.11.0 is already there",
        "open or update the Version Packages pull request against v1 from 1 changesets",
      ],
      publish: false,
      versionPackages: true,
    },
  });
});

it("never publishes outside CI", { timeout: 10_000 }, () => {
  expect.hasAssertions();
  expect(releasePlan({ ci: false, npm: npmAnswering(UNPUBLISHED), pending: [], version: VERSION })).toMatchObject({
    ok: true,
    value: {
      lines: ["publish nothing to npm: @ai-hero/cookout@0.11.0 isn't there, but only CI publishes", expect.any(String)],
      publish: false,
    },
  });
});

it("asks npm for exactly the chosen version and counts a 404 as unpublished", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const asked: string[] = [];
  const outcome = releasePlan({
    ci: true,
    npm: (args) => {
      asked.push(args.join(" "));
      return { ok: true, value: { status: 1, stderr: "npm error code E404\n", stdout: "" } };
    },
    pending: [],
    version: VERSION,
  });

  expect({ asked, outcome }).toMatchObject({
    asked: ["view @ai-hero/cookout@0.11.0 version"],
    outcome: { ok: true, value: { publish: true } },
  });
});

it("fails rather than guess when npm can't say whether the version is there", { timeout: 10_000 }, () => {
  expect.hasAssertions();
  expect(
    releasePlan({
      ci: true,
      npm: npmAnswering({ status: 1, stderr: "npm error code ETIMEDOUT\n", stdout: "" }),
      pending: [],
      version: VERSION,
    }),
  ).toStrictEqual({
    ok: false,
    reason: "npm view @ai-hero/cookout@0.11.0 failed with status 1: npm error code ETIMEDOUT",
  });
});

it("the Release workflow publishes on the decision, before Version Packages resets the tree", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const workflow = readFileSync(RELEASE_YML, "utf8");
  const steps = workflow
    .split("\n")
    .filter((line) => line.startsWith(STEP))
    .map((line) => line.slice(STEP.length));

  expect({
    decides: workflow.includes(DECIDE),
    keyedOnChangesets: workflow.includes("hasChangesets"),
    order: steps.filter((name) => ORDER.includes(name)),
    publishes: workflow.includes(PUBLISH),
  }).toStrictEqual({ decides: true, keyedOnChangesets: false, order: ORDER, publishes: true });
});
