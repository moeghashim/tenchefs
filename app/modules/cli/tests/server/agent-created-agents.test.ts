import {
  TestCookout,
  commandLineServices,
  freshStateFolder,
  runCookout,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

const EXIT_SUCCESS = 0;

it.effect("identity create run by an agent creates an agent for its owner and prints no token", () =>
  Effect.gen(function* agentCreatesAgent() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", { kind: "human" });
    const chief = yield* cookout.createIdentity("chief", { owner: "ada" });
    const env = { COOKOUT_STATE_DIR: yield* freshStateFolder, COOKOUT_TOKEN: chief.token, COOKOUT_URL: cookout.url };
    const args = ["identity", "create", "worker", "--kind", "agent", "--display-name", "Worker"];
    const result = yield* runCookout({ args: [...args, "--description", "Runs the build."], env });

    expect(result).toMatchObject({
      exitCode: EXIT_SUCCESS,
      stdoutJson: {
        identity: { broughtInBy: "chief", description: "Runs the build.", kind: "agent", name: "worker", owner: "ada" },
      },
    });
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/token|cookout_/u);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
