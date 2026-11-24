import { changesetMissing, packageShips } from "../lib/changesets.ts";
import { expect, it } from "vitest";

const SHIPPED: ReadonlySet<string> = new Set(["app/main.ts", "docs/agents.md"]);
function ships(file: string): boolean {
  return SHIPPED.has(file);
}

it("fails a package change with no changeset, naming the changed files", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const changes = [
    { file: "app/main.ts", status: "M" },
    { file: "docs/agents.md", status: "A" },
    { file: "README.md", status: "M" },
  ];

  expect(changesetMissing({ changes, ships })).toStrictEqual([
    "this changes files that ship in @ai-hero/cookout (app/main.ts, docs/agents.md), but adds no changeset since its merge base with v1. Add one with pnpm changeset, or pnpm changeset --empty for a change users never see, and commit it.",
  ]);
});

it("passes a package change with a changeset", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const changes = [
    { file: "app/main.ts", status: "M" },
    { file: ".changeset/brave-dogs-sing.md", status: "A" },
  ];

  expect(changesetMissing({ changes, ships })).toStrictEqual([]);
});

it("passes a package change with an empty changeset", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const changes = [
    { file: "app/main.ts", status: "M" },
    { file: ".changeset/quiet-cats-nap.md", status: "A" },
  ];

  expect(changesetMissing({ changes, ships })).toStrictEqual([]);
});

it("passes a change outside the package with no changeset", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const changes = [
    { file: "scripts/check.ts", status: "M" },
    { file: "app/modules/sdk/tests/server/sdk.test.ts", status: "A" },
  ];

  expect(changesetMissing({ changes, ships })).toStrictEqual([]);
});

it("doesn't count an edit to an existing changeset or the folder's README as a new changeset", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  const changes = [
    { file: "app/main.ts", status: "M" },
    { file: ".changeset/README.md", status: "A" },
    { file: ".changeset/old-news.md", status: "M" },
  ];

  expect(changesetMissing({ changes, ships })).toStrictEqual([
    "this changes files that ship in @ai-hero/cookout (app/main.ts), but adds no changeset since its merge base with v1. Add one with pnpm changeset, or pnpm changeset --empty for a change users never see, and commit it.",
  ]);
});

it("passes a release, which consumes changesets, with no new one", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const changes = [
    { file: ".changeset/old-news.md", status: "D" },
    { file: "app/main.ts", status: "M" },
  ];

  expect(changesetMissing({ changes, ships })).toStrictEqual([]);
});

it("ships the package's CLI, SDK, web UI, listed files and API report, and not its tests or dev tools", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const shipsInThePackage = await packageShips();

  expect(
    [
      "app/main.ts",
      "app/modules/sdk/index.ts",
      "app/web.tsx",
      "app/modules/sdk/lib/generated/validators.js",
      "package.json",
      "public/assets/theme.js",
      "public/assets/og-card.png",
      "api/sdk.api.md",
      "docs/agents.md",
      "skills/cookout/SKILL.md",
      "app/dev.ts",
      "app/modules/sdk/tests/server/sdk.test.ts",
      "scripts/check.ts",
    ].map((file) => shipsInThePackage(file)),
  ).toStrictEqual([true, true, true, true, true, true, true, true, true, true, false, false, false]);
});
