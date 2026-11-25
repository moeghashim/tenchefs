import { Array as Arr, Effect, Option, String as Str } from "effect";
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

const EXIT_FAILURE = 1;
const POLL_SECONDS = 2;
const SESSION_URL = "https://claude.ai/code/session_01AbCdEf";

function codeIn(prompt: string): string {
  return Option.getOrThrow(Arr.findFirst(Str.split(prompt, /[\s,]+/u), isUserCode));
}

const noLogin = Effect.gen(function* boxWithNoLogin() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", { kind: "human" });
  yield* cookout.createIdentity("cloud-worker", { owner: "ada" });
  const env = {
    CLAUDECODE: "1",
    CLAUDE_CODE_SESSION_ID: "s1",
    COOKOUT_STATE_DIR: yield* freshStateFolder,
    COOKOUT_URL: cookout.url,
  };
  return { ada, env };
});

it.effect("with no Login, join --session-url sets the session URL its owner sees once they approve", () =>
  Effect.gen(function* joinWithSessionUrl() {
    const { ada, env } = yield* noLogin;
    const joined = yield* runCookoutWhile({
      args: ["join", "--as", "cloud-worker", "--session-url", SESSION_URL],
      env,
      tickSeconds: POLL_SECONDS,
      whileRunning: (prompt) => answer(() => ada.client.approveAgentJoin(codeIn(prompt))),
    });
    const { agentSessions } = yield* answer(() => ada.client.listAgentSessions("cloud-worker"));

    expect(joined).toMatchObject({
      exitCode: 0,
      stdoutJson: { identity: "cloud-worker", sessionUrl: SESSION_URL, source: "agent-join-request" },
    });
    expect(agentSessions).toMatchObject([{ sessionUrl: SESSION_URL }]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("join --code --session-url sets the session URL its owner sees", () =>
  Effect.gen(function* joinByCodeWithSessionUrl() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const { joinCode } = yield* answer(() =>
      ada.client.createJoinCode({ displayName: "Cloud worker", name: "cloud-worker" }),
    );
    const env = {
      CLAUDECODE: "1",
      CLAUDE_CODE_SESSION_ID: "s1",
      COOKOUT_STATE_DIR: yield* freshStateFolder,
      COOKOUT_URL: cookout.url,
    };
    const joined = yield* runCookout({ args: ["join", "--code", joinCode, "--session-url", SESSION_URL], env });
    const { agentSessions } = yield* answer(() => ada.client.listAgentSessions("cloud-worker"));

    expect(joined).toMatchObject({
      exitCode: 0,
      stdoutJson: { identity: "cloud-worker", sessionUrl: SESSION_URL, source: "join-code" },
    });
    expect(agentSessions).toMatchObject([{ sessionUrl: SESSION_URL }]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("join refuses a --session-url that isn't an absolute http or https URL, with --as or --code", () =>
  Effect.gen(function* refusedSessionUrl() {
    const cookout = yield* TestCookout;
    const bot = yield* cookout.createIdentity("release-bot");
    const env = {
      CLAUDECODE: "1",
      CLAUDE_CODE_SESSION_ID: "s1",
      COOKOUT_STATE_DIR: yield* freshStateFolder,
      COOKOUT_TOKEN: bot.token,
      COOKOUT_URL: cookout.url,
    };
    const notWebError = {
      exitCode: EXIT_FAILURE,
      stderrJson: { error: { code: "invalid_request", details: [{ path: ["sessionUrl"] }] } },
    };
    const notWeb = yield* runCookout({ args: ["join", "--as", "release-bot", "--session-url", "ftp://box/1"], env });
    const withCode = yield* runCookout({ args: ["join", "--code", "any-code", "--session-url", "ftp://box/1"], env });

    expect([notWeb, withCode]).toMatchObject([notWebError, notWebError]);
    expect(notWeb.stderr).toContain("absolute http or https URL");
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
