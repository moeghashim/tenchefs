import { duplicateNumbers, takenOnV1 } from "../lib/adr-numbers.ts";
import { expect, it } from "vitest";

it("names two ADRs that share a number", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const duplicates = duplicateNumbers([
    "docs/adr/0032-the-admin-token.md",
    "docs/adr/0033-limits.md",
    "docs/adr/0033-the-hook.md",
    "docs/adr/README.md",
  ]);

  expect(duplicates).toStrictEqual([
    "docs/adr/0033-limits.md and docs/adr/0033-the-hook.md share ADR number 0033. Renumber one past the highest.",
  ]);
});

it("passes ADRs that each have their own number", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(duplicateNumbers(["docs/adr/0033-limits.md", "docs/adr/0034-the-hook.md"])).toStrictEqual([]);
});

it("names a ticket's new ADR whose number origin/v1 has since given another ADR", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const taken = takenOnV1({
    added: ["docs/adr/0034-mine.md", "docs/adr/0035-also-mine.md"],
    v1: ["docs/adr/0033-limits.md", "docs/adr/0034-theirs.md", "docs/adr/0035-and-theirs.md"],
  });

  expect(taken).toStrictEqual([
    "docs/adr/0034-mine.md takes ADR number 0034, which origin/v1 already gives docs/adr/0034-theirs.md. Renumber it to 0036, past origin/v1's highest, and fix every link to it.",
    "docs/adr/0035-also-mine.md takes ADR number 0035, which origin/v1 already gives docs/adr/0035-and-theirs.md. Renumber it to 0037, past origin/v1's highest, and fix every link to it.",
  ]);
});

it("passes new ADRs that origin/v1 already holds as they are, or whose numbers it hasn't used", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  expect(
    takenOnV1({
      added: ["docs/adr/0034-landed.md", "docs/adr/0035-mine.md"],
      v1: ["docs/adr/0033-limits.md", "docs/adr/0034-landed.md"],
    }),
  ).toStrictEqual([]);
});
