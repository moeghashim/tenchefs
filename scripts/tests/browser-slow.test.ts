import { expect, it } from "vitest";
import { slowBrowserArguments, slowBrowserRun } from "../lib/browser-slow.ts";

const FILE = "app/modules/routes/tests/browser/sidebar-keys.browser.test.ts";

it("takes an optional delay in ms, 700 by default, a browser test file and an optional -g title", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  expect([
    slowBrowserArguments([FILE]),
    slowBrowserArguments(["250", FILE, "-g", "subscribes"]),
    slowBrowserArguments([]),
    slowBrowserArguments(["250"]),
    slowBrowserArguments(["0", FILE]),
    slowBrowserArguments([FILE, "-g"]),
    slowBrowserArguments([FILE, "other.browser.test.ts"]),
  ]).toStrictEqual([
    { delayMs: 700, file: FILE, grep: [], ok: true },
    { delayMs: 250, file: FILE, grep: ["-g", "subscribes"], ok: true },
    { ok: false },
    { ok: false },
    { ok: false },
    { ok: false },
    { ok: false },
  ]);
});

it("runs Playwright once on the file with no retries, the delay in COOKOUT_BROWSER_SLOW_MS", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(slowBrowserRun({ delayMs: 250, file: FILE, grep: ["-g", "subscribes"] })).toStrictEqual({
    args: [
      "COOKOUT_BROWSER_SLOW_MS=250",
      "pnpm",
      "exec",
      "playwright",
      "test",
      FILE,
      "--retries=0",
      "-g",
      "subscribes",
    ],
    command: "env",
  });
});
