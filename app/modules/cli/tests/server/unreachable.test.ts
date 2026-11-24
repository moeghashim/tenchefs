import type { CliResult, CommandLineNeeds } from "../../../testing/server.ts";
import { Effect, Exit, FileSystem, Scope, Stdio, String as Str, Stream } from "effect";
import {
  TestCookout,
  answer,
  commandLineServices,
  forwardingProxy,
  freshDatabasePath,
  runCookout,
  runCookoutWhile,
  serverAnswering,
  startServe,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const TICK_SECONDS = 30;
const EXIT_TIMEOUT = 2;
const UNKNOWN_HOST = "http://cookout.invalid";
const CHECK_SETTINGS = "(check COOKOUT_URL, or HTTPS_PROXY if you are behind a proxy)";

type Env = Readonly<Record<string, string>>;

const closedPortUrl = Effect.scoped(serverAnswering({ text: "closed once the scope ends" }));

it.effect("cookout watch keeps retrying, naming the URL in the same wording, when the server stops answering", () =>
  Effect.gen(function* watchServerGone() {
    const database = yield* freshDatabasePath;
    const serving = yield* Scope.make();
    const server = yield* Scope.provide(serving)(startServe({ database }));
    const env = { COOKOUT_TOKEN: server.adminToken, COOKOUT_URL: server.url };

    const result = yield* runCookoutWhile({
      args: ["watch", "--timeout", "600"],
      env,
      tickSeconds: TICK_SECONDS,
      whileRunning: () => Scope.close(serving, Exit.void),
    });

    expect(result.exitCode).toBe(EXIT_TIMEOUT);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(`board unavailable (cannot reach ${server.url}: `);
    expect(result.stderr).toContain(`${CHECK_SETTINGS}), retrying in 30s`);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("a refused port gives unreachable, naming the URL and the refused connection", () =>
  Effect.gen(function* refusedPort() {
    const url = yield* Effect.map(closedPortUrl, Str.replace("127.0.0.1", "localhost"));
    const result = yield* runCookout({ args: ["whoami"], env: { COOKOUT_TOKEN: "any", COOKOUT_URL: url } });

    expect(result).toMatchObject({ exitCode: 1, stderrJson: { error: { code: "unreachable" } } });
    expect(result.stderr).toMatch(/ECONNREFUSED/u);
    expect(result.stderr).toContain(`cannot reach ${url}: `);
    expect(result.stderr).toContain(CHECK_SETTINGS);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("an unknown host gives unreachable, naming the URL and the failed lookup", () =>
  Effect.gen(function* unknownHost() {
    const result = yield* runCookout({ args: ["whoami"], env: { COOKOUT_TOKEN: "any", COOKOUT_URL: UNKNOWN_HOST } });

    expect(result).toMatchObject({ exitCode: 1, stderrJson: { error: { code: "unreachable" } } });
    expect(result.stderr).toContain(`cannot reach ${UNKNOWN_HOST}: getaddrinfo `);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("with HTTP_PROXY set, the CLI sends its request to the proxy, which answers for a host it can't see", () =>
  Effect.gen(function* throughProxy() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann");
    const body = yield* answer(() => ann.client.whoami());
    const proxy = yield* serverAnswering({ body });
    const env = { COOKOUT_TOKEN: ann.token, COOKOUT_URL: UNKNOWN_HOST };

    const viaProxy = yield* runCookout({ args: ["whoami"], env: { ...env, HTTP_PROXY: proxy } });
    const viaLowercase = yield* runCookout({ args: ["whoami"], env: { ...env, http_proxy: proxy } });

    expect([viaProxy, viaLowercase]).toMatchObject([
      { exitCode: 0, stdoutJson: { identity: { name: "ann" } } },
      { exitCode: 0, stdoutJson: { identity: { name: "ann" } } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a host NO_PROXY names is reached directly, past HTTP_PROXY", () =>
  Effect.gen(function* bypassProxy() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann");
    const deadProxy = yield* closedPortUrl;
    const env = { COOKOUT_TOKEN: ann.token, COOKOUT_URL: cookout.url, HTTP_PROXY: deadProxy, NO_PROXY: "127.0.0.1" };

    const direct = yield* runCookout({ args: ["whoami"], env });

    expect(direct).toMatchObject({ exitCode: 0, stdoutJson: { identity: { name: "ann" } } });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("with HTTPS_PROXY set, an https:// server is reached through it, and a dead proxy gives unreachable", () =>
  Effect.gen(function* deadHttpsProxy() {
    const deadProxy = yield* closedPortUrl;
    const env = { COOKOUT_TOKEN: "any", COOKOUT_URL: "https://cookout.invalid", HTTPS_PROXY: deadProxy };

    const result = yield* runCookout({ args: ["whoami"], env });

    expect(result).toMatchObject({ exitCode: 1, stderrJson: { error: { code: "unreachable" } } });
    expect(result.stderr).toMatch(/ECONNREFUSED/u);
  }).pipe(Effect.provide(commandLineServices)),
);

const encoder = new TextEncoder();

function logIn(env: Env, token: string): Effect.Effect<CliResult, never, CommandLineNeeds> {
  const stdin = Stdio.layerTest({ stdin: Stream.make(encoder.encode(`${token}\n`)) });
  return runCookout({ args: ["login", "--token"], env }).pipe(Effect.provide(stdin));
}

const configFolder = Effect.flatMap(FileSystem.FileSystem, (fs) =>
  Effect.orDie(fs.makeTempDirectoryScoped({ prefix: "cookout-config-" })),
);

it.effect("login --token goes through HTTP_PROXY, both to check the board and to check the token", () =>
  Effect.gen(function* loginThroughProxy() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const proxy = yield* forwardingProxy({ target: cookout.url });
    const folder = yield* configFolder;
    const env = { COOKOUT_URL: UNKNOWN_HOST, HTTP_PROXY: proxy.url, XDG_CONFIG_HOME: folder };

    const result = yield* logIn(env, ada.token);
    const forwarded = yield* proxy.forwarded;

    expect(result).toMatchObject({ exitCode: 0, stdoutJson: { identity: { name: "ada" } } });
    expect(forwarded).toStrictEqual(["GET /v1/health", "GET /v1/whoami"]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("login through a dead HTTPS_PROXY gives unreachable, naming the board, with a token or by browser", () =>
  Effect.gen(function* loginDeadProxy() {
    const deadProxy = yield* closedPortUrl;
    const folder = yield* configFolder;
    const board = "https://cookout.invalid";
    const env = { COOKOUT_URL: board, HTTPS_PROXY: deadProxy, XDG_CONFIG_HOME: folder };

    const withToken = yield* logIn(env, "any");
    const byBrowser = yield* runCookout({ args: ["login"], env });

    expect([withToken, byBrowser]).toMatchObject([
      { exitCode: 1, stderrJson: { error: { code: "unreachable" } } },
      { exitCode: 1, stderrJson: { error: { code: "unreachable" } } },
    ]);
    expect(withToken.stderr).toContain(`cannot reach ${board}: `);
  }).pipe(Effect.provide(commandLineServices)),
);
