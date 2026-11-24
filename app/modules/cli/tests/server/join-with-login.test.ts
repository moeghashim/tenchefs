import { Array as Arr, Effect, FileSystem, Option, Stdio, String as Str, Stream } from "effect";
import type { CliResult, CommandLineNeeds } from "../../../testing/server.ts";
import {
  TestCookout,
  answer,
  commandLineServices,
  freshStateFolder,
  runCookout,
  runCookoutWhile,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { isUserCode } from "../../../logins/index.ts";

type Env = Readonly<Record<string, string>>;

const EXIT_FAILURE = 1;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const POLL_SECONDS = 2;
const EXPIRY_SECONDS = 60;
const encoder = new TextEncoder();

function logIn(env: Env, token: string): Effect.Effect<CliResult, never, CommandLineNeeds> {
  const stdin = Stdio.layerTest({ stdin: Stream.make(encoder.encode(`${token}\n`)) });
  return runCookout({ args: ["login", "--token"], env }).pipe(Effect.provide(stdin));
}

const configFolder = Effect.flatMap(FileSystem.FileSystem, (fs) =>
  Effect.orDie(fs.makeTempDirectoryScoped({ prefix: "cookout-config-" })),
);

it.effect("inside Claude Code, join uses the Login to join an agent the human owns; other verbs don't", () =>
  Effect.gen(function* joinWithLogin() {
    const cookout = yield* TestCookout;
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    yield* cookout.createIdentity("triage-agent", { owner: "grace" });
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    const terminal = {
      COOKOUT_STATE_DIR: yield* freshStateFolder,
      COOKOUT_URL: cookout.url,
      XDG_CONFIG_HOME: yield* configFolder,
    };
    const session = { ...terminal, CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "s1" };
    yield* logIn(terminal, grace.token);
    const steps: readonly (readonly string[])[] = [
      ["message", "post", "grill", "as grace"],
      ["join", "--as", "triage-agent"],
      ["message", "post", "grill", "triaged"],
    ];
    const results = yield* Effect.forEach(steps, (args) => runCookout({ args, env: session }), ONE_AT_A_TIME);

    expect(results).toMatchObject([
      { exitCode: EXIT_FAILURE, stderrJson: { error: { code: "not_joined" } } },
      { exitCode: 0, stdoutJson: { created: false, identity: "triage-agent", source: "login" } },
      { exitCode: 0, stdoutJson: { message: { author: { name: "triage-agent" } } } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("join inside Claude Code prints no agent session token, whether it used the Login or COOKOUT_TOKEN", () =>
  Effect.gen(function* joinPrintsNoToken() {
    const cookout = yield* TestCookout;
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    const bot = yield* cookout.createIdentity("release-bot");
    const terminal = {
      COOKOUT_STATE_DIR: yield* freshStateFolder,
      COOKOUT_URL: cookout.url,
      XDG_CONFIG_HOME: yield* configFolder,
    };
    yield* logIn(terminal, grace.token);
    const joins = [
      {
        args: ["join", "--as", "triage-agent", "--display-name", "Triage bot"],
        env: { ...terminal, CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "s1" },
      },
      {
        args: ["join", "--as", "release-bot"],
        env: { ...terminal, CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "s2", COOKOUT_TOKEN: bot.token },
      },
    ];
    const results = yield* Effect.forEach(joins, runCookout, ONE_AT_A_TIME);

    expect(results).toMatchObject([
      { exitCode: 0, stdoutJson: { created: true, identity: "triage-agent", source: "login" } },
      { exitCode: 0, stdoutJson: { created: false, identity: "release-bot", source: "COOKOUT_TOKEN" } },
    ]);
    expect(
      Arr.join(
        Arr.map(results, ({ stdout }) => stdout),
        "",
      ),
    ).not.toContain("agentSessionToken");
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

function codeIn(prompt: string): string {
  return Option.getOrThrow(Arr.findFirst(Str.split(prompt, /[\s,]+/u), isUserCode));
}

const noLogin = Effect.gen(function* boxWithNoLogin() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", { kind: "human" });
  const env = {
    CLAUDECODE: "1",
    CLAUDE_CODE_SESSION_ID: "s1",
    COOKOUT_STATE_DIR: yield* freshStateFolder,
    COOKOUT_URL: cookout.url,
    XDG_CONFIG_HOME: yield* configFolder,
  };
  return { ada, cookout, env };
});

it.effect("inside Claude Code with no Login, join prints a link and code, and joins once a person approves", () =>
  Effect.gen(function* joinByBrowser() {
    const { ada, cookout, env } = yield* noLogin;
    const joined = yield* runCookoutWhile({
      args: ["join", "--as", "triage-agent", "--idle-expiry", "30d"],
      env,
      tickSeconds: POLL_SECONDS,
      whileRunning: (prompt) => answer(() => ada.client.approveAgentJoin(codeIn(prompt), { idleExpiry: "7d" })),
    });
    const whoami = yield* runCookout({ args: ["whoami"], env });

    expect(joined.stderr).toMatch(new RegExp(`Open ${cookout.url}/#/approve-join/[A-Z0-9-]{9}, check`, "u"));
    expect(joined).toMatchObject({
      exitCode: 0,
      stdoutJson: {
        created: true,
        expiresAt: "2026-01-08T00:00:00.000Z",
        identity: "triage-agent",
        source: "agent-join-request",
      },
    });
    expect(whoami).toMatchObject({
      exitCode: 0,
      stdoutJson: {
        identity: { name: "triage-agent", owner: "ada" },
        summary: `triage-agent (agent join request, joined just now) at ${cookout.url}`,
      },
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("with no Login, join --print-env prints the export once approved, and an unapproved join expires", () =>
  Effect.gen(function* printEnvByBrowser() {
    const { ada, env } = yield* noLogin;
    const terminal = { ...env, CLAUDECODE: "", CLAUDE_CODE_SESSION_ID: "" };
    const printed = yield* runCookoutWhile({
      args: ["join", "--as", "scout", "--print-env"],
      env: terminal,
      tickSeconds: POLL_SECONDS,
      whileRunning: (prompt) => answer(() => ada.client.approveAgentJoin(codeIn(prompt))),
    });
    const expired = yield* runCookoutWhile({
      args: ["join", "--as", "scout"],
      env,
      tickSeconds: EXPIRY_SECONDS,
      whileRunning: Effect.succeed,
    });

    expect(printed).toMatchObject({ exitCode: 0 });
    expect(printed.stdout).toMatch(/^export COOKOUT_SESSION=cookout_/u);
    expect(expired).toMatchObject({ exitCode: EXIT_FAILURE });
    expect(expired.stderr).toContain('"code":"agent_join_request_expired"');
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("join sends COOKOUT_SESSION before the Login, and with no COOKOUT_URL and no default board it says so", () =>
  Effect.gen(function* joinPrecedence() {
    const cookout = yield* TestCookout;
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    const bot = yield* cookout.createIdentity("release-bot");
    const { agentSessionToken } = yield* answer(() => bot.client.join({ as: "release-bot" }));
    const terminal = { COOKOUT_URL: cookout.url, XDG_CONFIG_HOME: yield* configFolder };
    const inClaudeCode = { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "s1", COOKOUT_STATE_DIR: yield* freshStateFolder };
    yield* logIn(terminal, grace.token);
    const envs: readonly Env[] = [
      { ...terminal, ...inClaudeCode, COOKOUT_SESSION: agentSessionToken },
      { ...inClaudeCode, XDG_CONFIG_HOME: yield* configFolder },
    ];
    const results = yield* Effect.forEach(
      envs,
      (env) => runCookout({ args: ["join", "--as", "release-bot", "--print-env"], env }),
      ONE_AT_A_TIME,
    );

    expect(results).toMatchObject([
      { exitCode: EXIT_FAILURE, stderrJson: { error: { code: "agent_session_live" } } },
      { exitCode: EXIT_FAILURE, stderrJson: { error: { code: "url_missing" } } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
