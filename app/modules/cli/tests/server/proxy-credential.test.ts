import { Array as Arr, Effect, pipe } from "effect";
import type { CliResult, CommandLineNeeds } from "../../../testing/server.ts";
import {
  TestCookout,
  commandLineServices,
  forwardingProxy,
  freshStateFolder,
  runCookout,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

type Env = Readonly<Record<string, string>>;

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const UNKNOWN_HOST = "http://cookout.invalid";

function claudeCode(env: Env): Env {
  return { ...env, CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "s1" };
}

function runAll(
  args: readonly (readonly string[])[],
  env: Env,
): Effect.Effect<readonly CliResult[], never, CommandLineNeeds> {
  return pipe(
    args,
    Effect.forEach((command) => runCookout({ args: command, env }), ONE_AT_A_TIME),
  );
}

it.effect("with COOKOUT_AUTH=proxy, the CLI sends no token and whoami names the proxy as the source", () =>
  Effect.gen(function* proxyCredential() {
    const cookout = yield* TestCookout;
    const bot = yield* cookout.createIdentity("release-bot");
    const proxy = yield* forwardingProxy({ addsToken: bot.token, target: cookout.url });
    const env = claudeCode({
      COOKOUT_AUTH: "proxy",
      COOKOUT_STATE_DIR: yield* freshStateFolder,
      COOKOUT_URL: UNKNOWN_HOST,
      HTTP_PROXY: proxy.url,
    });

    const results = yield* runAll([["whoami"], ["inbox"]], env);
    const withToken = yield* runCookout({ args: ["whoami"], env: { ...env, COOKOUT_TOKEN: "cookout_x" } });
    const authorizations = yield* proxy.authorizations;

    expect([...results, withToken]).toMatchObject([
      {
        exitCode: 0,
        stdoutJson: {
          identity: { name: "release-bot" },
          source: "proxy",
          summary: `release-bot (proxy) at ${UNKNOWN_HOST}`,
        },
      },
      { exitCode: 0 },
      { exitCode: 0, stdoutJson: { identity: { name: "release-bot" }, source: "proxy" } },
    ]);
    expect(authorizations).toContain("");
    expect(Arr.filter(authorizations, (sent) => sent !== "")).toStrictEqual([]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("with COOKOUT_AUTH=proxy, an ignored COOKOUT_TOKEN or joined session gets one note on stderr only", () =>
  Effect.gen(function* proxyIgnoredNote() {
    const cookout = yield* TestCookout;
    const bot = yield* cookout.createIdentity("release-bot");
    const proxy = yield* forwardingProxy({ addsToken: bot.token, target: cookout.url });
    const shared = claudeCode({
      COOKOUT_STATE_DIR: yield* freshStateFolder,
      COOKOUT_URL: UNKNOWN_HOST,
      HTTP_PROXY: proxy.url,
    });
    const env = { ...shared, COOKOUT_AUTH: "proxy" };

    const whoami = { args: ["whoami"], env };
    const whoamiWithToken = { args: ["whoami"], env: { ...env, COOKOUT_TOKEN: "cookout_x" } };
    const join = { args: ["join", "--as", "release-bot"], env: { ...shared, COOKOUT_TOKEN: bot.token } };

    const [nothingSet, tokenSet, , joined, both] = yield* Effect.forEach(
      [whoami, whoamiWithToken, join, whoami, whoamiWithToken],
      runCookout,
      ONE_AT_A_TIME,
    );

    expect([nothingSet, tokenSet, joined, both]).toMatchObject([
      { exitCode: 0, stderr: "", stdoutJson: { source: "proxy" } },
      {
        exitCode: 0,
        stderr:
          "COOKOUT_TOKEN ignored: with COOKOUT_AUTH=proxy the proxy adds the credential; " +
          "to stop this, unset COOKOUT_TOKEN",
        stdoutJson: { source: "proxy" },
      },
      {
        exitCode: 0,
        stderr:
          "the session joined as release-bot ignored: with COOKOUT_AUTH=proxy the proxy adds the credential; " +
          "to stop this, run `cookout leave` without COOKOUT_AUTH",
        stdoutJson: { source: "proxy" },
      },
      {
        exitCode: 0,
        stderr:
          "COOKOUT_TOKEN and the session joined as release-bot ignored: with COOKOUT_AUTH=proxy the proxy adds " +
          "the credential; to stop this, unset COOKOUT_TOKEN and run `cookout leave` without COOKOUT_AUTH",
        stdoutJson: { source: "proxy" },
      },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("with COOKOUT_AUTH=proxy inside a harness, a person's token from the proxy is still agent_as_human", () =>
  Effect.gen(function* proxyHuman() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const proxy = yield* forwardingProxy({ addsToken: ada.token, target: cookout.url });
    const env = claudeCode({ COOKOUT_AUTH: "proxy", COOKOUT_URL: UNKNOWN_HOST, HTTP_PROXY: proxy.url });

    const result = yield* runCookout({ args: ["whoami"], env });

    expect(result).toMatchObject({ exitCode: 1, stderrJson: { error: { code: "agent_as_human" } } });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("without COOKOUT_AUTH, a missing credential is refused: not_joined in a harness, token_missing outside", () =>
  Effect.gen(function* noProxyCredential() {
    const cookout = yield* TestCookout;
    const shared = {
      COOKOUT_STATE_DIR: yield* freshStateFolder,
      COOKOUT_URL: cookout.url,
      XDG_CONFIG_HOME: yield* freshStateFolder,
    };

    const inside = yield* runCookout({ args: ["whoami"], env: claudeCode(shared) });
    const outside = yield* runCookout({ args: ["whoami"], env: shared });

    expect([inside, outside]).toMatchObject([
      { exitCode: 1, stderrJson: { error: { code: "not_joined" } } },
      { exitCode: 1, stderrJson: { error: { code: "token_missing" } } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a COOKOUT_AUTH other than proxy is refused with usage, naming the variable", () =>
  Effect.gen(function* unknownAuth() {
    const cookout = yield* TestCookout;
    const env = { COOKOUT_AUTH: "proxi", COOKOUT_URL: cookout.url };

    const result = yield* runCookout({ args: ["whoami"], env });

    expect(result).toMatchObject({ exitCode: 1, stderrJson: { error: { code: "usage" } } });
    expect(result.stderr).toContain("COOKOUT_AUTH");
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("with COOKOUT_AUTH=proxy and no board's URL anywhere, whoami is url_missing", () =>
  Effect.gen(function* proxyNoBoard() {
    const env = claudeCode({
      COOKOUT_AUTH: "proxy",
      COOKOUT_STATE_DIR: yield* freshStateFolder,
      XDG_CONFIG_HOME: yield* freshStateFolder,
    });

    const result = yield* runCookout({ args: ["whoami"], env });

    expect(result).toMatchObject({ exitCode: 1, stderrJson: { error: { code: "url_missing" } } });
  }).pipe(Effect.provide(commandLineServices)),
);
