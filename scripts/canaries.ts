import { changesetMissing, packageShips } from "./lib/changesets.ts";
import { fail, oxlint, tool, unwrap } from "./lib/tools.ts";
import { field, list, parseJson, text } from "./lib/json.ts";
import { readFileSync, readdirSync } from "node:fs";
import { adrEdits } from "./lib/adr-append-only.ts";
import { canaryResponseSchemas } from "../lint/canary/validators/schemas.ts";
import { generateValidators } from "./lib/validators.ts";
import { migrationsInserted } from "./lib/migrations-append-only.ts";

type Canary = { readonly check: string; readonly code: string; readonly file: string };

const SCRIPT = "canaries";
const ROOT = "lint/canary";
const MODULE = `${ROOT}/app/modules/canary`;

const localRuleFile = (rule: string) => {
  if (rule === "effect-errors") {
    return `${MODULE}/lib/server/${rule}.ts`;
  }
  if (rule === "no-pass-through") {
    return `${MODULE}/index.ts`;
  }
  return `${MODULE}/lib/${rule}.ts`;
};

const otherPluginRules: ReadonlySet<string> = new Set([
  "agent-factory",
  "board-store-owner",
  "exact-locators",
  "keymap-owner",
  "no-internal-tag",
  "own-clock",
  "page-title-owner",
  "region-lookups",
]);

const rulesByModule: ReadonlyMap<string, readonly string[]> = new Map([
  ["type-declarations", ["no-overloads", "no-pick-intersections"]],
]);

const localRules = readdirSync("lint/rules")
  .filter((file) => file.endsWith(".js"))
  .map((file) => file.slice(0, -".js".length))
  .flatMap((module) => rulesByModule.get(module) ?? [module])
  .filter((rule) => !otherPluginRules.has(rule));

const nativeRules: readonly (readonly [string, string])[] = [
  ["typescript(no-explicit-any)", "no-explicit-any"],
  ["typescript(no-non-null-assertion)", "no-non-null-assertion"],
  ["typescript(no-unsafe-argument)", "no-unsafe-argument"],
  ["typescript(no-unsafe-assignment)", "no-unsafe-assignment"],
  ["typescript(no-unsafe-call)", "no-unsafe-call"],
  ["typescript(no-unsafe-member-access)", "no-unsafe-member-access"],
  ["typescript(no-unsafe-return)", "no-unsafe-return"],
  ["typescript(switch-exhaustiveness-check)", "switch-exhaustiveness-check"],
  ["eslint(complexity)", "complexity"],
  ["typescript(ban-ts-comment)", "ban-ts-comment"],
  ["eslint(no-restricted-globals)", "no-restricted-globals"],
  ["eslint(no-restricted-globals)", "no-restricted-globals.confirm"],
  ["eslint(no-restricted-properties)", "no-restricted-properties"],
  ["eslint(no-restricted-properties)", "no-restricted-properties.confirm"],
  ["eslint(no-restricted-imports)", "no-restricted-imports.effect"],
  ["eslint(no-restricted-imports)", "no-restricted-imports.sqlite"],
  ["web-rules(page-title-owner)", "page-title-owner"],
  ["web-rules(keymap-owner)", "keymap-owner"],
  ["web-rules(board-store-owner)", "board-store-owner"],
  ["export-rules(no-internal-tag)", "no-internal-tag"],
];

const testRules: readonly (readonly [string, string])[] = [
  ["vitest(max-nested-describe)", "server/max-nested-describe"],
  ["vitest(no-hooks)", "server/no-hooks"],
  ["vitest(require-hook)", "server/require-hook"],
  ["vitest-js(padding-around-all)", "server/padding-around-all"],
  ["eslint(no-restricted-imports)", "server/no-restricted-imports.process"],
  ["eslint(no-restricted-imports)", "server/no-restricted-imports.binary"],
  ["eslint(no-restricted-imports)", "no-restricted-imports.effect"],
  ["test-rules(region-lookups)", "region-lookups"],
  ["test-rules(own-clock)", "own-clock"],
  ["test-rules(agent-factory)", "agent-factory"],
  ["test-rules(exact-locators)", "exact-locators"],
];

const backendRules: readonly (readonly [string, string])[] = [["effecttsgo(global-date)", "global-date"]];

const lintCanaries: readonly Canary[] = [
  ...localRules.map((rule) => ({ check: "oxlint", code: `local(${rule})`, file: localRuleFile(rule) })),
  ...nativeRules.map(([code, name]) => ({ check: "oxlint", code, file: `${MODULE}/lib/${name}.ts` })),
  ...testRules.map(([code, name]) => ({ check: "oxlint", code, file: `${MODULE}/tests/${name}.test.ts` })),
  ...backendRules.map(([code, name]) => ({ check: "oxlint", code, file: `${MODULE}/lib/server/${name}.ts` })),
];

const lintPasses: readonly Canary[] = [
  { check: "oxlint", code: "web-rules(keymap-owner)", file: `${ROOT}/app/modules/keymap/index.ts` },
  { check: "oxlint", code: "web-rules(board-store-owner)", file: `${ROOT}/app/modules/board/index.ts` },
];

const tscCanaries: readonly Canary[] = [
  { check: "tsc", code: "TS2322", file: `${ROOT}/tsc/assignability.ts` },
  { check: "tsc", code: "TS2322", file: `${ROOT}/tsc/unchecked-index.ts` },
];

const seamCanaries: readonly Canary[] = [
  { check: "dependency-cruiser", code: "entry-points-only-from-app", file: `${ROOT}/seams/deep-import.ts` },
  { check: "dependency-cruiser", code: "sqlite-only-in-storage-adapter", file: `${ROOT}/seams/sqlite.ts` },
  { check: "dependency-cruiser", code: "radix-only-in-design-system", file: `${ROOT}/seams/radix.ts` },
  {
    check: "dependency-cruiser",
    code: "serve-never-reaches-the-adjustable-clock",
    file: `${ROOT}/seams/app/main.ts`,
  },
  {
    check: "dependency-cruiser",
    code: "tests-only-at-tested-interfaces",
    file: `${ROOT}/seams/app/modules/http/tests/server/health.test.ts`,
  },
];

const key = (code: string, file: string) => `${code} ${file}`;

const lintCaught = (): ReadonlySet<string> => {
  const diagnostics = unwrap(SCRIPT, oxlint(["-c", `${ROOT}/.oxlintrc.json`, `${ROOT}/app`]));
  return new Set(diagnostics.map((diagnostic) => key(diagnostic.code, diagnostic.filename)));
};

const tscCaught = (): ReadonlySet<string> => {
  const run = unwrap(SCRIPT, tool("tsc", ["-p", `${ROOT}/tsc/tsconfig.json`, "--noEmit", "--pretty", "false"]));
  const errors = [...run.stdout.matchAll(/^(\S+)\(\d+,\d+\): error (TS\d+):/gm)];
  return new Set(errors.map(([, file = "", code = ""]) => key(code, file)));
};

const violation = (entry: unknown) => {
  const rule = text(field(field(entry, "rule"), "name"));
  const from = text(field(entry, "from"));
  return rule && from ? [key(rule, from)] : [];
};

const seamsCaught = (): ReadonlySet<string> => {
  const run = unwrap(SCRIPT, tool("depcruise", [`${ROOT}/seams`, "--output-type", "json"]));
  const violations = list(field(field(parseJson(run.stdout), "summary"), "violations"));
  if (!violations) {
    fail(SCRIPT, `dependency-cruiser produced no JSON report: ${run.stderr.trim()}`);
  }
  return new Set((violations ?? []).flatMap(violation));
};

const missing = (canaries: readonly Canary[], caught: ReadonlySet<string>) =>
  canaries.filter((canary) => !caught.has(key(canary.code, canary.file)));

const VALIDATOR_CANARY = `${ROOT}/validators/schemas.ts`;

const validatorCanaries: readonly Canary[] = [{ check: "validators", code: "require(", file: VALIDATOR_CANARY }];

function validatorsCaught(): ReadonlySet<string> {
  const { requires } = generateValidators({ canary: canaryResponseSchemas });
  return new Set(requires.map(() => key("require(", VALIDATOR_CANARY)));
}

const ADR_CANARY = `${ROOT}/adrs/edited-in-place.diff`;
const ADR_CODE = "append-only";
const ADR_CANARY_EDITS = "docs/adr/0055-read-receipts-come-from-the-read-position.md";

const adrCanaries: readonly Canary[] = [{ check: "hygiene", code: ADR_CODE, file: ADR_CANARY }];

function adrsCaught(): ReadonlySet<string> {
  const diff = readFileSync(ADR_CANARY, "utf8");
  const edits = adrEdits({ diff, locked: new Set([ADR_CANARY_EDITS]), originals: new Map() });
  return new Set(edits.map(() => key(ADR_CODE, ADR_CANARY)));
}

const DEPLOYED_MIGRATIONS = `${ROOT}/migrations/deployed.txt`;
const MIGRATIONS_CANARY = `${ROOT}/migrations/inserted-mid-list.txt`;
const MIGRATIONS_CODE = "index 2 (schema version 3) differs";

const migrationCanaries: readonly Canary[] = [{ check: "hygiene", code: MIGRATIONS_CODE, file: MIGRATIONS_CANARY }];

function migrationsCaught(): ReadonlySet<string> {
  const inserted = migrationsInserted({
    base: readFileSync(DEPLOYED_MIGRATIONS, "utf8"),
    baseName: "deploy/canary",
    file: MIGRATIONS_CANARY,
    head: readFileSync(MIGRATIONS_CANARY, "utf8"),
  });
  return new Set(
    inserted.filter((reason) => reason.includes(MIGRATIONS_CODE)).map(() => key(MIGRATIONS_CODE, MIGRATIONS_CANARY)),
  );
}

const CHANGESET_CANARY = `${ROOT}/changesets/no-changeset.txt`;
const CHANGESET_CODE = "ship in @ai-hero/cookout (app/modules/sdk/index.ts)";

const changesetCanaries: readonly Canary[] = [{ check: "hygiene", code: CHANGESET_CODE, file: CHANGESET_CANARY }];

async function changesetsCaught(): Promise<ReadonlySet<string>> {
  const changes = readFileSync(CHANGESET_CANARY, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [status = "", file = ""] = line.split("\t");
      return { file, status };
    });
  const reasons = changesetMissing({ changes, ships: await packageShips() });
  return new Set(
    reasons.filter((reason) => reason.includes(CHANGESET_CODE)).map(() => key(CHANGESET_CODE, CHANGESET_CANARY)),
  );
}

const caughtByLint = lintCaught();
const escaped = [
  ...missing(lintCanaries, caughtByLint),
  ...missing(tscCanaries, tscCaught()),
  ...missing(seamCanaries, seamsCaught()),
  ...missing(validatorCanaries, validatorsCaught()),
  ...missing(adrCanaries, adrsCaught()),
  ...missing(migrationCanaries, migrationsCaught()),
  ...missing(changesetCanaries, await changesetsCaught()),
];
const overreached = lintPasses.filter((canary) => caughtByLint.has(key(canary.code, canary.file)));
for (const canary of escaped) {
  console.error(`${SCRIPT}: ${canary.check} did not report ${canary.code} for its planted violation in ${canary.file}`);
}
for (const canary of overreached) {
  console.error(`${SCRIPT}: ${canary.check} reported ${canary.code} in ${canary.file}, where it is allowed`);
}
process.exitCode = [...escaped, ...overreached].length > 0 ? 1 : 0;
