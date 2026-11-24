import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generateValidators } from "./lib/validators.ts";
import { responseSchemas } from "./lib/response-schemas.ts";

interface GeneratedFile {
  readonly contents: string;
  readonly path: string;
}

const SCRIPT = "validators";
const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;
const NONE = 0;
const OUT_DIR = "app/modules/sdk/lib/generated";
const generated = generateValidators(responseSchemas);
const files: readonly GeneratedFile[] = [
  { contents: generated.javascript, path: `${OUT_DIR}/validators.js` },
  { contents: generated.declarations, path: `${OUT_DIR}/validators.d.ts` },
];

function isStale({ contents, path }: GeneratedFile): boolean {
  return !existsSync(path) || readFileSync(path, "utf8") !== contents;
}

function check(): number {
  const stale = files.filter((file) => isStale(file));
  for (const { path } of stale) {
    console.error(`Drift: ${path} doesn't match the response Schemas. Run \`pnpm validators\` and commit the result.`);
  }
  if (stale.length === NONE) {
    return EXIT_SUCCESS;
  }
  return EXIT_FAILURE;
}

function write(): number {
  for (const { contents, path } of files) {
    writeFileSync(path, contents);
  }
  return EXIT_SUCCESS;
}

function main(): number {
  for (const module of generated.requires) {
    console.error(
      `${SCRIPT}: a generated validator calls require(${module}), which crashes the ESM build. Use a Schema check that ajv compiles with no runtime import.`,
    );
  }
  if (generated.requires.length > NONE) {
    return EXIT_FAILURE;
  }
  if (process.argv.includes("--check")) {
    return check();
  }
  return write();
}

process.exitCode = main();
