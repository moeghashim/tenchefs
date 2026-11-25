import { Array as Arr, Effect, String as Str, pipe } from "effect";
import type { CliResult, CommandLineNeeds } from "../../../testing/server.ts";
import {
  TestCookout,
  answer,
  commandLineServices,
  freshStateFolder,
  runCookout,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

interface Step {
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

type Env = Readonly<Record<string, string>>;

const EXIT_FAILURE = 1;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const succeeded = { exitCode: 0, stderr: "" };

function failedWith(code: string): object {
  return { exitCode: EXIT_FAILURE, stderrJson: { error: { code } } };
}

function runAll(steps: readonly Step[]): Effect.Effect<readonly CliResult[], never, CommandLineNeeds> {
  return pipe(steps, Effect.forEach(runCookout, ONE_AT_A_TIME));
}

function claudeCode(session: string, shared: Env): Env {
  return { ...shared, CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: session };
}

const joinCodeFor = Effect.gen(function* makeJoinCode() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", { kind: "human" });
  const { joinCode } = yield* answer(() =>
    ada.client.createJoinCode({ displayName: "joining-agent", name: "joining-agent" }),
  );
  const folder = yield* freshStateFolder;
  return { joinCode, shared: { COOKOUT_STATE_DIR: folder, COOKOUT_URL: cookout.url } };
});

it.effect("join --code joins the code's agent for this harness session with no other credential, once", () =>
  Effect.gen(function* joinByCode() {
    const { joinCode, shared } = yield* joinCodeFor;
    const results = yield* runAll([
      { args: ["join", "--code", joinCode], env: claudeCode("s1", shared) },
      { args: ["whoami"], env: claudeCode("s1", shared) },
      { args: ["join", "--code", joinCode], env: claudeCode("s2", shared) },
    ]);

    expect(results).toMatchObject([
      {
        ...succeeded,
        stdoutJson: {
          created: false,
          identity: "joining-agent",
          issuedAt: "2026-01-01T00:00:00.000Z",
          source: "join-code",
        },
      },
      { ...succeeded, stdoutJson: { identity: { name: "joining-agent", owner: "ada" } } },
      failedWith("join_code_not_found"),
    ]);
    expect(Arr.map(results, ({ stdout }) => Str.includes("cookout_test_")(stdout))).toStrictEqual([
      false,
      false,
      false,
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("join --code --print-env prints the export, and --code with --as is refused", () =>
  Effect.gen(function* printByCode() {
    const { joinCode, shared } = yield* joinCodeFor;
    const withAs = yield* runCookout({
      args: ["join", "--code", joinCode, "--as", "other"],
      env: claudeCode("s1", shared),
    });
    const printed = yield* runCookout({
      args: ["join", "--code", joinCode, "--idle-expiry", "1d", "--print-env"],
      env: shared,
    });

    expect([withAs, printed]).toMatchObject([failedWith("usage"), succeeded]);
    expect(printed.stdout).toMatch(/^export COOKOUT_SESSION=cookout_\S+$/u);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
