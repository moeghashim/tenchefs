import {
  TestCookout,
  answer,
  commandLineServices,
  freshStateFolder,
  runCookout,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

const EXIT_FAILURE = 1;

const board = Effect.gen(function* seedBoard() {
  const cookout = yield* TestCookout;
  yield* cookout.createIdentity("ada", { kind: "human" });
  const chief = yield* cookout.createIdentity("chief", { owner: "ada" });
  const env = { COOKOUT_STATE_DIR: yield* freshStateFolder, COOKOUT_TOKEN: chief.token, COOKOUT_URL: cookout.url };
  return { cookout, env };
});

it.effect("an agent approves another agent's join by its code, and the new agent collects its own session", () =>
  Effect.gen(function* approveByCode() {
    const { cookout, env } = yield* board;
    const started = yield* answer(() =>
      cookout.clientFor().startAgentJoin({ as: "worker", host: "box", idleExpiry: "7d" }),
    );
    const approved = yield* runCookout({
      args: ["approve-join", started.userCode, "--idle-expiry", "1d", "--force"],
      env,
    });
    const collected = yield* answer(() => cookout.clientFor().collectAgentJoin(started.requestId));

    expect(approved).toMatchObject({
      exitCode: 0,
      stdoutJson: { agentJoinRequest: { approved: true, creates: true, idleExpiry: "1d", joins: "worker" } },
    });
    expect(collected).toMatchObject({ agentSession: { identity: "worker" }, status: "approved" });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("approve-join exits non-zero with the refusal when an agent approves a join it may not", () =>
  Effect.gen(function* refusedByCode() {
    const { cookout, env } = yield* board;
    yield* cookout.createIdentity("worker", { owner: "ada" });
    const started = yield* answer(() => cookout.clientFor().startAgentJoin({ as: "worker", host: "box" }));
    const refused = yield* runCookout({ args: ["approve-join", started.userCode], env });

    expect(refused).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "not_brought_in" } } });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
