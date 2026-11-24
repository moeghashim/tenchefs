import { Array as Arr, Effect, Stdio, Stream } from "effect";
import type { CliResult, CommandLineNeeds } from "../../../testing/server.ts";
import { TestCookout, commandLineServices, runCookout, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

type Env = Readonly<Record<string, string>>;

const URL_OF = "https://routines.example.com/fire";
const TOKEN = "routine-secret";
const EXIT_FAILURE = 1;
const succeeded = { exitCode: 0, stderr: "" };
const encoder = new TextEncoder();

function withStdin(args: readonly string[], env: Env, text: string): Effect.Effect<CliResult, never, CommandLineNeeds> {
  const stdin = Stdio.layerTest({ stdin: Stream.make(encoder.encode(text)) });
  return runCookout({ args, env }).pipe(Effect.provide(stdin));
}

const ownerEnv = Effect.gen(function* mattAndHisAgent() {
  const cookout = yield* TestCookout;
  const matt = yield* cookout.createIdentity("matt", { kind: "human" });
  yield* cookout.createIdentity("triage", { owner: "matt" });
  return { COOKOUT_TOKEN: matt.token, COOKOUT_URL: cookout.url };
});

const setGetClear = Effect.gen(function* runTriggerVerbs() {
  const env = yield* ownerEnv;
  const set = yield* withStdin(["identity", "trigger", "set", "triage", URL_OF], env, `${TOKEN}\n`);
  const got = yield* runCookout({ args: ["identity", "trigger", "get", "triage"], env });
  const cleared = yield* runCookout({ args: ["identity", "trigger", "clear", "triage"], env });
  const after = yield* runCookout({ args: ["identity", "trigger", "get", "triage"], env });
  return [set, got, cleared, after];
});

it.effect(
  "cookout identity trigger set reads the token from stdin, get shows the URL but never the token, and clear clears",
  () =>
    Effect.gen(function* triggerVerbs() {
      const results = yield* setGetClear;

      expect(results).toMatchObject([
        { ...succeeded, stdoutJson: { trigger: { url: URL_OF } } },
        { ...succeeded, stdoutJson: { trigger: { url: URL_OF } } },
        { ...succeeded, stdoutJson: { trigger: null } },
        { ...succeeded, stdoutJson: { trigger: null } },
      ]);
      expect(
        Arr.join(
          Arr.map(results, ({ stdout }) => stdout),
          "",
        ),
      ).not.toContain(TOKEN);
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout identity trigger set with nothing on stdin is a usage error, and sets nothing", () =>
  Effect.gen(function* noToken() {
    const env = yield* ownerEnv;
    const refused = yield* withStdin(["identity", "trigger", "set", "triage", URL_OF], env, "\n");
    const got = yield* runCookout({ args: ["identity", "trigger", "get", "triage"], env });

    expect([refused, got]).toMatchObject([
      { exitCode: EXIT_FAILURE, stderrJson: { error: { code: "usage" } } },
      { stdoutJson: { trigger: null } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
