import { Ajv2020 } from "ajv/dist/2020.js";
import { parse } from "yaml";
import { readFileSync } from "node:fs";

const SCHEMA_PATH = new URL("../render-yaml.schema.json", import.meta.url);

const validate = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(
  JSON.parse(readFileSync(SCHEMA_PATH, "utf8")),
);

function lineOf(instancePath: string, message: string | undefined): string {
  return `${instancePath || "/"} ${message ?? "is invalid"}`;
}

function renderYamlErrors(source: string): readonly string[] {
  if (validate(parse(source))) {
    return [];
  }
  const lines: string[] = [];
  for (const error of validate.errors ?? []) {
    lines.push(lineOf(error.instancePath, error.message));
  }
  return lines;
}

const RENDER_SCHEMA_SOURCE =
  "scripts/render-yaml.schema.json, vendored 2026-11-25 from https://render.com/schema/render.yaml.json";

export { RENDER_SCHEMA_SOURCE, renderYamlErrors };
