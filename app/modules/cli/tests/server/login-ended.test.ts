import { Array as Arr, Duration, Effect, FileSystem, Option, String as Str } from "effect";
import type { CliResult, CommandLineNeeds, TestIdentity } from "../../../testing/server.ts";
import {
  TestCookout,
  answer,
  commandLineServices,
  runCookout,
  runCookoutWhile,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import { isUserCode } from "../../../logins/index.ts";

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const POLL_SECONDS = 2;
const DAYS_UNUSED = 90;

type Env = Readonly<Record<string, string>>;

function codeIn(prompt: string): string {
  return Option.getOrThrow(Arr.findFirst(Str.split(prompt, /[\s,]+/u), isUserCode));
}

function logInByBrowser(env: Env, ada: TestIdentity): Effect.Effect<CliResult, never, CommandLineNeeds | Scope.Scope> {
  return runCookoutWhile({
    args: ["login"],
    env,
    tickSeconds: POLL_SECONDS,
    whileRunning: (prompt) => answer(() => ada.client.approveLogin(codeIn(prompt))),
  });
}

function inbox(env: Env): Effect.Effect<CliResult, never, CommandLineNeeds> {
  return runCookout({ args: ["inbox"], env });
}

const loggedInByBrowser = Effect.gen(function* logInAda() {
  const cookout = yield* TestCookout;
  const fs = yield* FileSystem.FileSystem;
  const ada = yield* cookout.createIdentity("ada", { kind: "human" });
  const folder = yield* Effect.orDie(fs.makeTempDirectoryScoped({ prefix: "cookout-config-" }));
  const env = { COOKOUT_URL: cookout.url, XDG_CONFIG_HOME: folder };
  yield* logInByBrowser(env, ada);
  return { cookout, env };
});

it.effect(
  "a saved Login refused as expired or unknown exits 1 naming the board and saying cookout login logs in again",
  () =>
    Effect.gen(function* savedLoginEnds() {
      const { cookout, env } = yield* loggedInByBrowser;
      yield* TestClock.adjust(Duration.days(DAYS_UNUSED));
      const results = yield* Effect.all([inbox(env), inbox(env)], ONE_AT_A_TIME);
      const again = `The Login saved for ${cookout.url} no longer works: run \`cookout login\` to log in again.`;

      expect(results).toMatchObject([
        { exitCode: 1, stderrJson: { error: { code: "login_expired" } } },
        { exitCode: 1, stderrJson: { error: { code: "token_unknown" } } },
      ]);
      expect(Arr.map(results, ({ stderr }) => Str.includes(again)(stderr))).toStrictEqual([true, true]);
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
