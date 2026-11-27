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

type Env = Readonly<Record<string, string>>;

const POLL_SECONDS = 2;
const PAST_EXPIRY_MINUTES = 11;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const FIRST_LOGIN = { host: "laptop" } as const;

function codeIn(prompt: string): string {
  return Option.getOrThrow(Arr.findFirst(Str.split(prompt, /[\s,]+/u), isUserCode));
}

function run(env: Env, ...args: readonly string[]): Effect.Effect<CliResult, never, CommandLineNeeds> {
  return runCookout({ args, env });
}

function logInByBrowser(env: Env, ada: TestIdentity): Effect.Effect<CliResult, never, CommandLineNeeds | Scope.Scope> {
  return runCookoutWhile({
    args: ["login"],
    env,
    tickSeconds: POLL_SECONDS,
    whileRunning: (prompt) => answer(() => ada.client.approveLogin(codeIn(prompt))),
  });
}

const twoMachines = Effect.gen(function* makeTwoMachines() {
  const cookout = yield* TestCookout;
  const fs = yield* FileSystem.FileSystem;
  const ada = yield* cookout.createIdentity("ada", { kind: "human" });
  const configFolder = Effect.orDie(fs.makeTempDirectoryScoped({ prefix: "cookout-config-" }));
  const first = { COOKOUT_URL: cookout.url, XDG_CONFIG_HOME: yield* configFolder };
  const second = { COOKOUT_URL: cookout.url, XDG_CONFIG_HOME: yield* configFolder };
  return { ada, cookout, first, second };
});

const SOME_TEXT: unknown = expect.any(String);
const details = { clientIp: SOME_TEXT, createdAt: SOME_TEXT, where: SOME_TEXT };

it.effect("login approve approves another machine's waiting login, printing its details, and both act as ada", () =>
  Effect.gen(function* approveFromCli() {
    const { ada, cookout, first, second } = yield* twoMachines;
    yield* logInByBrowser(first, ada);

    const login = yield* runCookoutWhile({
      args: ["login"],
      env: second,
      tickSeconds: POLL_SECONDS,
      whileRunning: (prompt) => run(first, "login", "approve", codeIn(prompt)),
    });
    const results = yield* Effect.all([run(first, "whoami"), run(second, "whoami")], ONE_AT_A_TIME);

    expect(login.during).toMatchObject({
      exitCode: 0,
      stdoutJson: { loginRequest: { ...details, approved: true, kind: "terminal" } },
    });
    expect(login).toMatchObject({ exitCode: 0, stdoutJson: { identity: { name: "ada" }, url: cookout.url } });
    expect(results).toMatchObject([
      { exitCode: 0, stdoutJson: { identity: { name: "ada" }, source: "login" } },
      { exitCode: 0, stdoutJson: { identity: { name: "ada" }, source: "login" } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("login approve with an agent's token is refused with human_only, and the request stays unapproved", () =>
  Effect.gen(function* agentApproves() {
    const cookout = yield* TestCookout;
    const bot = yield* cookout.createIdentity("release-bot", { owner: "matt" });
    const started = yield* answer(() => cookout.clientFor().startLogin(FIRST_LOGIN));

    const refused = yield* run(
      { COOKOUT_TOKEN: bot.token, COOKOUT_URL: cookout.url },
      "login",
      "approve",
      started.userCode,
    );
    const collected = yield* answer(() => cookout.clientFor().collectLogin(started.requestId));

    expect(refused).toMatchObject({ exitCode: 1, stderrJson: { error: { code: "human_only" } } });
    expect(collected).toMatchObject({ status: "pending" });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("login approve refuses an unknown, a malformed or an expired code with the server's refusal", () =>
  Effect.gen(function* refusedCodes() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const env = { COOKOUT_TOKEN: ada.token, COOKOUT_URL: cookout.url };
    const started = yield* answer(() => cookout.clientFor().startLogin(FIRST_LOGIN));
    const unknown = yield* run(env, "login", "approve", "WDJB-MJHT");
    const malformed = yield* run(env, "login", "approve", "not-a-code");
    yield* TestClock.adjust(Duration.minutes(PAST_EXPIRY_MINUTES));
    const expired = yield* run(env, "login", "approve", started.userCode);

    expect([unknown, malformed, expired]).toMatchObject([
      { exitCode: 1, stderrJson: { error: { code: "login_request_not_found" } } },
      { exitCode: 1, stderrJson: { error: { code: "not_found" } } },
      { exitCode: 1, stderrJson: { error: { code: "login_request_not_found" } } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("login --help lists approve, and still describes the browser and --token logins", () =>
  Effect.gen(function* loginHelp() {
    const cookout = yield* TestCookout;

    const help = yield* run({ COOKOUT_URL: cookout.url }, "login", "--help");

    expect(help).toMatchObject({ exitCode: 0 });
    expect(help.stdout).toMatch(/approve\s+Approve another machine's waiting `cookout login`/u);
    expect(help.stdout).toContain("--token");
    expect(help.stdout).toContain("approves it in the web UI");
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect.each([
  { allowHuman: {}, shown: "inside a harness" },
  { allowHuman: { COOKOUT_ALLOW_HUMAN: "1" }, shown: "inside a harness with COOKOUT_ALLOW_HUMAN=1" },
])(
  "login approve $shown is refused with approval_in_harness, and the request stays unapproved",
  ({ allowHuman }: { readonly allowHuman: Env }) =>
    Effect.gen(function* approveInHarness() {
      const { ada, cookout, first } = yield* twoMachines;
      yield* logInByBrowser(first, ada);
      const started = yield* answer(() => cookout.clientFor().startLogin(FIRST_LOGIN));
      const harness = { ...first, ...allowHuman, CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "s1" };

      const withLogin = yield* run(harness, "login", "approve", started.userCode);
      const withToken = yield* run({ ...harness, COOKOUT_TOKEN: ada.token }, "login", "approve", started.userCode);
      const collected = yield* answer(() => cookout.clientFor().collectLogin(started.requestId));

      expect([withLogin, withToken]).toMatchObject([
        { exitCode: 1, stderrJson: { error: { code: "approval_in_harness" } } },
        { exitCode: 1, stderrJson: { error: { code: "approval_in_harness" } } },
      ]);
      expect(collected).toMatchObject({ status: "pending" });
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("login approve in a wake run is refused with approval_in_harness, and the request stays unapproved", () =>
  Effect.gen(function* approveInWakeRun() {
    const { ada, cookout, first } = yield* twoMachines;
    yield* logInByBrowser(first, ada);
    const started = yield* answer(() => cookout.clientFor().startLogin(FIRST_LOGIN));

    const refused = yield* run({ ...first, COOKOUT_WAKE_RUN: "1" }, "login", "approve", started.userCode);
    const collected = yield* answer(() => cookout.clientFor().collectLogin(started.requestId));

    expect(refused).toMatchObject({ exitCode: 1, stderrJson: { error: { code: "approval_in_harness" } } });
    expect(collected).toMatchObject({ status: "pending" });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
