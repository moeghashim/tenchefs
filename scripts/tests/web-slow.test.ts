import { expect, it } from "vitest";
import { slowArguments, slowRun } from "../lib/web-slow.ts";

const FILE = "app/modules/routes/tests/inbox-author.test.tsx";
const OTHER = "app/modules/routes/tests/inbox-read-rule.test.tsx";

it("takes an optional delay in ms, 700 by default, then one or more web test files", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect([
    slowArguments([FILE]),
    slowArguments(["250", FILE, OTHER]),
    slowArguments([]),
    slowArguments(["250"]),
    slowArguments(["0", FILE]),
  ]).toStrictEqual([
    { delayMs: 700, files: [FILE], ok: true },
    { delayMs: 250, files: [FILE, OTHER], ok: true },
    { ok: false },
    { ok: false },
    { ok: false },
  ]);
});

it("runs vitest's web projects on the files, providing the delay as webSlowMs", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(slowRun({ delayMs: 250, files: [FILE] })).toStrictEqual({
    files: [FILE],
    options: { project: ["web", "web-clock"], provide: { webSlowMs: 250 }, run: true },
  });
});
