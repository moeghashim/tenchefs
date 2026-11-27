import { dependenciesAboveNodeFloor, nodeFloor } from "./lib/node-floor.ts";
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";

it.each([".", "packages/handler-example"])(
  "the Node floor %s declares covers every runtime dependency's Node floor",
  { timeout: 5000 },
  (dir) => {
    expect.hasAssertions();

    expect(dependenciesAboveNodeFloor(dir)).toStrictEqual([]);
  },
);

it("the README and the agents' guide name the package's Node floor", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const sentence = `Node ${nodeFloor(".")} or later`;

  expect(
    ["README.md", "docs/agents.md"].filter((file) => !readFileSync(file, "utf8").includes(sentence)),
  ).toStrictEqual([]);
});
