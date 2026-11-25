import { RENDER_SCHEMA_SOURCE, renderYamlErrors } from "./lib/render-yaml.ts";
import { readFileSync } from "node:fs";

const EXIT_FAILURE = 1;
const NONE = 0;

const errors = renderYamlErrors(readFileSync("render.yaml", "utf8"));
for (const error of errors) {
  console.error(`render: render.yaml ${error} (schema: ${RENDER_SCHEMA_SOURCE})`);
}
if (errors.length > NONE) {
  process.exitCode = EXIT_FAILURE;
}
