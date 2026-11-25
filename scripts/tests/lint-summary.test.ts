import { expect, it } from "vitest";
import { ruleSummary } from "../lib/lint-summary.ts";

const LIMIT = 40;
const MANY_RULES = 60;
const LAST = -1;

it("counts each failing rule, most frequent first, with its first violation as the example", { timeout: 1000 }, () => {
  expect.hasAssertions();
  expect(
    ruleSummary([
      "app/a.ts:3 eslint(no-var) Unexpected var.",
      "app/a.ts:4 eslint(no-magic-numbers) No magic number: 7",
      "app/b.ts:9 eslint(no-magic-numbers) No magic number: 6 (one of 2; the baseline allows 1)",
      "3 new violations in 2 files",
    ]),
  ).toStrictEqual([
    "By rule (3 violations; the full list is above):",
    "  2 eslint(no-magic-numbers), e.g. app/a.ts:4 No magic number: 7",
    "  1 eslint(no-var), e.g. app/a.ts:3 Unexpected var.",
  ]);
});

it("counts a single violation in the singular", { timeout: 1000 }, () => {
  expect.hasAssertions();
  expect(ruleSummary(["a.ts:2 eslint(no-var) Unexpected var."])).toStrictEqual([
    "By rule (1 violation; the full list is above):",
    "  1 eslint(no-var), e.g. a.ts:2 Unexpected var.",
  ]);
});

it("prints nothing when no violation was reported", { timeout: 1000 }, () => {
  expect.hasAssertions();
  expect(ruleSummary(["some other line", ""])).toStrictEqual([]);
});

it("caps the summary at about 40 lines and says how many rules it left out", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const lines = Array.from({ length: MANY_RULES }, (_unused, index) => `a.ts:1 eslint(rule-${String(index)}) Bad.`);
  const summary = ruleSummary(lines);

  expect([summary.length, summary.at(LAST)]).toStrictEqual([LIMIT, "  ...and 22 more rules (see the full list above)"]);
});
