import { unitShardPlan, unitTestFiles } from "./unit-shards.ts";
import type { CiOnly } from "./check-runner.ts";
import type { Outcome } from "./tools.ts";
import type { Plan } from "./timed-shards.ts";

type UnitTests =
  | { readonly all: true; readonly reason: string }
  | { readonly all: false; readonly related: readonly string[] };

const REACHES_EVERYTHING_FILES = new Set([
  ".dependency-cruiser.cjs",
  ".nvmrc",
  ".oxlintrc.fix.json",
  ".oxlintrc.json",
  "biome.json",
  "knip.json",
  "lefthook.yml",
  "package.json",
  "playwright.config.ts",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "tsconfig.sdk.json",
  "tsdown.config.ts",
  "vite.config.ts",
  "vitest.config.ts",
  "scripts/browser-test-server.ts",
  "scripts/jsdom-server-environment.ts",
  "scripts/postgres-test-container.ts",
  "scripts/s3-test-container.ts",
  "scripts/web-test-environment.ts",
  "scripts/web-test-setup.ts",
  "scripts/web-test-server.ts",
]);
const REACHES_EVERYTHING_DIRECTORIES = ["app/modules/testing/"];

const FIRST = 0;
const ONE = 1;

function isDocs(file: string): boolean {
  return file.endsWith(".md") || file.startsWith("docs/") || file.startsWith(".changeset/");
}

function everythingReachedBy(changed: readonly string[]): string {
  return changed
    .filter(
      (file) =>
        REACHES_EVERYTHING_FILES.has(file) ||
        REACHES_EVERYTHING_DIRECTORIES.some((directory) => file.startsWith(directory)),
    )
    .slice(FIRST, ONE)
    .map((file) => `${file} reaches every test`)
    .join("");
}

function unitTestsFor(changed: Outcome<readonly string[]>): UnitTests {
  if (!changed.ok) {
    return { all: true, reason: changed.reason };
  }
  const reason = everythingReachedBy(changed.value);
  if (reason !== "") {
    return { all: true, reason };
  }
  return { all: false, related: changed.value.filter((file) => !isDocs(file)) };
}

function unitSkip(tests: UnitTests): readonly CiOnly[] {
  if (tests.all) {
    return [];
  }
  return [
    {
      ciJob: "tests",
      command: "pnpm test",
      name: "the unit tests whose imports reach no changed file",
    },
  ];
}

interface CiShard {
  readonly cwd: string;
  readonly gh: (args: readonly string[]) => Outcome<string>;
  readonly run: string;
  readonly shard: string;
}

function ciUnitShard(sharding: CiShard): Plan {
  return unitShardPlan({ ...sharding, ...unitTestFiles(sharding.cwd) });
}

export type { UnitTests };
export { ciUnitShard, everythingReachedBy, isDocs, unitSkip, unitTestsFor };
