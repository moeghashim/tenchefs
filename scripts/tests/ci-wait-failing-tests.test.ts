import { COMPLETED, RUN, URL as RUN_URL, ended, fake, reasonOf, view } from "./lib/fake-gh.ts";
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";

const LOG_LINES = -20;

function recorded(name: string): string {
  return readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8");
}

function redReason(name: string, log: string): string {
  const gh = fake({
    list: [RUN],
    log: [log],
    view: [view({ jobs: [ended({ conclusion: "failure", failedStep: "pnpm check", name })], status: COMPLETED })],
  });
  return reasonOf(gh.gate(["--commit", "abc"]).step);
}

function tailOf(log: string): string {
  return log.trim().split("\n").slice(LOG_LINES).join("\n");
}

it("names a red Vitest job's failing test and its assertion before the log tail", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const log = recorded("ci-vitest-job.log");

  expect(redReason("tests 1/2", log)).toBe(
    [
      `v1's latest Check run is red: tests 1/2 (failure).\n${RUN_URL}`,
      "tests 1/2 failed steps: pnpm check",
      "Failing tests:",
      "  FAIL web app/modules/routes/tests/trigger-url.test.tsx > an agent whose trigger call fails shows Unreachable, and the owner's Clear takes the URL away",
      "    AssertionError: expected <p …(1)></p> to be null",
      "    - Expected:",
      "    null",
      "    + Received:",
      "    <p",
      tailOf(log),
    ].join("\n"),
  );
});

it("names a red Playwright job's failing test once and its assertion before the log tail", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const log = recorded("ci-playwright-job.log");

  expect(redReason("browser 1/3", log)).toBe(
    [
      `v1's latest Check run is red: browser 1/3 (failure).\n${RUN_URL}`,
      "browser 1/3 failed steps: pnpm check",
      "Failing tests:",
      "  FAIL [chromium] › app/modules/routes/tests/browser/inbox-open.browser.test.ts:102:1 › an Inbox thread address without a message still opens, scrolled to the newest message",
      "    Error: expect(locator).toBeInViewport() failed",
      "    Locator: getByRole('complementary', { name: 'Conversation' }).getByRole('article').filter({ hasText: 'Step 1 done' }).last()",
      "    Expected: in viewport",
      "    Timeout: 10000ms",
      "    Error: element(s) not found",
      tailOf(log),
    ].join("\n"),
  );
});
