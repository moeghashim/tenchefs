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

function codeIn(prompt: string): string {
  return Option.getOrThrow(Arr.findFirst(Str.split(prompt, /[\s,]+/u), isUserCode));
}

const board = Effect.gen(function* seedBoard() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", { kind: "human" });
  const bob = yield* cookout.createIdentity("bob", { kind: "human" });
  yield* cookout.createIdentity("scout", { owner: "ada" });
  const box = { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "s1", COOKOUT_STATE_DIR: yield* freshStateFolder };
  const env = { ...box, COOKOUT_URL: cookout.url };
  const asAda = { COOKOUT_STATE_DIR: yield* freshStateFolder, COOKOUT_TOKEN: ada.token, COOKOUT_URL: cookout.url };
  const asBob = { ...asAda, COOKOUT_TOKEN: bob.token };
  return { ada, asAda, asBob, cookout, env };
});

it.effect("a waiting join stops with agent_join_request_denied once someone who could approve it dismisses it", () =>
  Effect.gen(function* joinDismissed() {
    const { ada, env } = yield* board;
    const refused = yield* runCookoutWhile({
      args: ["join", "--as", "scout"],
      env,
      tickSeconds: POLL_SECONDS,
      whileRunning: (prompt) => answer(() => ada.client.denyAgentJoin(codeIn(prompt))),
    });

    expect(refused).toMatchObject({ exitCode: EXIT_FAILURE });
    expect(refused.stderr).toContain('"code":"agent_join_request_denied"');
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect(
  "deny-join dismisses a join request by its code, and exits non-zero for someone who couldn't approve it",
  () =>
    Effect.gen(function* denyByCode() {
      const { ada, asAda, asBob, cookout } = yield* board;
      const started = yield* answer(() => cookout.clientFor().startAgentJoin({ as: "scout", host: "box" }));
      const refused = yield* runCookout({ args: ["deny-join", started.userCode], env: asBob });
      const denied = yield* runCookout({ args: ["deny-join", started.userCode], env: asAda });
      const { agentJoinRequests } = yield* answer(() => ada.client.inbox());

      expect(refused).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "agent_not_found" } } });
      expect(denied).toMatchObject({ exitCode: 0, stdoutJson: { denied: true, userCode: started.userCode } });
      expect(agentJoinRequests).toStrictEqual([]);
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
