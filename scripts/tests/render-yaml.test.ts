import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderYamlErrors } from "../lib/render-yaml.ts";

const NONE = 0;
const repoFile = readFileSync("render.yaml", "utf8");

it("the repo's render.yaml is valid by Render's Blueprint schema", { timeout: 10_000 }, () => {
  expect.hasAssertions();
  expect(renderYamlErrors(repoFile)).toStrictEqual([]);
});

it("a render.yaml with an unknown key or a wrong plan is invalid", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const unknownKey = repoFile.replace("    numInstances: 1", "    numInstances: 1\n    instances: 1");
  const wrongPlan = repoFile.replace("plan: 0.5c-512mb", "plan: huge");

  expect(renderYamlErrors(unknownKey).length).toBeGreaterThan(NONE);
  expect(renderYamlErrors(wrongPlan).length).toBeGreaterThan(NONE);
});
