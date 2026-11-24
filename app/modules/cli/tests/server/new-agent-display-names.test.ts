import { Array as Arr, Effect } from "effect";
import {
  TestCookout,
  answer,
  commandLineServices,
  freshStateFolder,
  runCookout,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { CliResult } from "../../../testing/server.ts";

const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const usage = { exitCode: EXIT_FAILURE, stderrJson: { error: { code: "usage" } } };

const joins: readonly (readonly string[])[] = [
  ["join", "--as", "scout", "--print-env"],
  ["join", "--as", "scout", "--display-name", "Scout bot", "--print-env"],
  ["join", "--as", "triage-agent", "--print-env"],
  ["join", "--as", "triage-agent", "--display-name", "Triage bot", "--force", "--print-env"],
  ["join", "--code", "abc", "--display-name", "Triage bot"],
];

function stderrOf(results: readonly CliResult[]): string {
  return Arr.join(
    Arr.map(results, ({ stderr }) => stderr),
    "\n",
  );
}

it.effect("join creates a new agent only with --display-name, and refuses the flag for an agent that exists", () =>
  Effect.gen(function* newAgentNeedsDisplayName() {
    const cookout = yield* TestCookout;
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    yield* cookout.createIdentity("triage-agent", { owner: "grace" });
    const env = { COOKOUT_STATE_DIR: yield* freshStateFolder, COOKOUT_TOKEN: grace.token, COOKOUT_URL: cookout.url };
    const results = yield* Effect.forEach(joins, (args) => runCookout({ args, env }), ONE_AT_A_TIME);
    const { identities } = yield* answer(cookout.client.listIdentities);

    expect(results).toMatchObject([usage, { exitCode: EXIT_SUCCESS }, { exitCode: EXIT_SUCCESS }, usage, usage]);
    expect(stderrOf(results)).toMatch(/join with --display-name[\s\S]*cookout identity display-name triage-agent/u);
    expect(Arr.map(identities, ({ displayName = "", name }) => `${name}: ${displayName}`)).toStrictEqual([
      "admin: ",
      "grace: ",
      "scout: Scout bot",
      "triage-agent: ",
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("joining with an agent's own token takes no --display-name", () =>
  Effect.gen(function* ownTokenTakesNoDisplayName() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("grace", { kind: "human" });
    const bot = yield* cookout.createIdentity("release-bot", { owner: "grace" });
    const env = { COOKOUT_STATE_DIR: yield* freshStateFolder, COOKOUT_TOKEN: bot.token, COOKOUT_URL: cookout.url };
    const args = ["join", "--as", "release-bot", "--display-name", "Release bot", "--print-env"];
    const result = yield* runCookout({ args, env });

    expect(result).toMatchObject(usage);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("identity create --kind agent needs --display-name, refused before any request", () =>
  Effect.gen(function* agentCreateNeedsDisplayName() {
    const env = { COOKOUT_TOKEN: "unused", COOKOUT_URL: "http://127.0.0.1:1" };
    const result = yield* runCookout({ args: ["identity", "create", "x", "--kind", "agent"], env });

    expect(result).toMatchObject(usage);
    expect(result.stderr).toContain("add --display-name");
  }).pipe(Effect.provide(commandLineServices)),
);
