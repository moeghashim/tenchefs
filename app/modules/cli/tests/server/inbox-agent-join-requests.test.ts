import type { CommandLineNeeds, TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import {
  TestCookout,
  answer,
  commandLineServices,
  freshStateFolder,
  runCookout,
  testCookout,
  watchCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { AgentJoinRequestStartedResponse } from "../../../agent-sessions/index.ts";
import { Effect } from "effect";
import type { Scope } from "effect";
import { createTestAgent } from "../../../testing/index.ts";

interface Board {
  readonly cookout: TestCookoutService;
  readonly env: Readonly<Record<string, string>>;
}

const EXIT_SUCCESS = 0;
const ONE_LINE = 1;
const asked = { as: "worker", host: "build-box" };
const TEXT = "@worker asks to join from build-box.";

function started(cookout: TestCookoutService): Effect.Effect<AgentJoinRequestStartedResponse> {
  return answer(() => cookout.clientFor().startAgentJoin(asked));
}

function workerBroughtInBy(chief: TestIdentity): Effect.Effect<void> {
  return Effect.asVoid(
    answer(() => createTestAgent({ broughtIn: true, by: chief.client, displayName: "worker", name: "worker" })),
  );
}

const chiefBroughtInWorker: Effect.Effect<Board, never, TestCookout | CommandLineNeeds | Scope.Scope> = Effect.gen(
  function* seedBoard() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", { kind: "human" });
    const chief = yield* cookout.createIdentity("chief", { owner: "ada" });
    yield* workerBroughtInBy(chief);
    const env = { COOKOUT_STATE_DIR: yield* freshStateFolder, COOKOUT_TOKEN: chief.token, COOKOUT_URL: cookout.url };
    return { cookout, env };
  },
);

it.effect("cookout inbox lists a pending join request, and cookout approve-join with its code takes it out", () =>
  Effect.gen(function* inboxThenApprove() {
    const { cookout, env } = yield* chiefBroughtInWorker;
    const request = yield* started(cookout);
    const listed = yield* runCookout({ args: ["inbox"], env });
    const approved = yield* runCookout({ args: ["approve-join", request.userCode], env });
    const after = yield* runCookout({ args: ["inbox"], env });

    expect(listed).toMatchObject({
      exitCode: EXIT_SUCCESS,
      stdoutJson: { agentJoinRequests: [{ agent: { name: "worker" }, text: TEXT, userCode: request.userCode }] },
    });
    expect(approved).toMatchObject({ exitCode: EXIT_SUCCESS, stdoutJson: { agentJoinRequest: { approved: true } } });
    expect(after).toMatchObject({ exitCode: EXIT_SUCCESS, stdoutJson: { agentJoinRequests: [] } });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout watch prints a line for a join request as it starts, naming the approve-join to run", () =>
  Effect.gen(function* watchJoinRequest() {
    const { cookout, env } = yield* chiefBroughtInWorker;
    const { stdoutLines } = yield* watchCookout({
      args: ["watch"],
      env,
      lines: ONE_LINE,
      whileWatching: Effect.asVoid(started(cookout)),
    });

    expect(stdoutLines).toStrictEqual([
      expect.stringMatching(
        /^@worker asks to join from build-box\. Run cookout approve-join \S+ to approve it, or cookout deny-join \S+ to dismiss it\.$/u,
      ),
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout watch --until-mention exits 0 at start-up when a join request is waiting", () =>
  Effect.gen(function* untilMentionAtStart() {
    const { cookout, env } = yield* chiefBroughtInWorker;
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    yield* answer(() => cookout.client.createMessage({ channel: "grill", text: "morning" }));
    yield* started(cookout);
    const result = yield* runCookout({ args: ["watch", "--until-mention"], env });

    expect(result).toMatchObject({ exitCode: EXIT_SUCCESS, stdout: "1 unread, run cookout inbox" });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
