import { MIGRATION_LISTS } from "./migration-lists.ts";
import type { MergeRules } from "./merge-ticket.ts";

function pnpm(...args: readonly string[]): readonly string[] {
  return ["pnpm", "run", "--silent", ...args];
}

const mergeRules: MergeRules = {
  adrs: "docs/adr",
  appendOnly: MIGRATION_LISTS,
  hunks: [
    ...MIGRATION_LISTS.map((file) => ({ file, resolve: "append" as const })),
    { file: "vitest.config.ts", resolve: "lower" },
  ],
  regenerate: [
    { command: pnpm("validators"), files: String.raw`^app/modules/sdk/lib/generated/` },
    { command: pnpm("api:write"), files: String.raw`^api/[^/]+\.api\.md$` },
    { command: pnpm("lint:baseline"), files: String.raw`^lint-baseline\.json$` },
  ],
};

export { mergeRules };
