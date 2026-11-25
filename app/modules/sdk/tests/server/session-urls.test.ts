import type { AgentSessionResponse, CookoutClient } from "../../index.ts";
import { Array as Arr, Effect, Predicate } from "effect";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { AgentJoinCollectedResponse } from "../../../agent-sessions/index.ts";

const BAD_REQUEST = 400;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const SESSION_URL = "https://claude.ai/code/session_01AbCdEf";
const AS = { as: "cloud-worker" } as const;
const NOT_A_SESSION_URL = {
  message: "Use an absolute http or https URL of at most 2048 characters, such as https://example.com/sessions/1.",
  path: ["sessionUrl"],
};

interface Owned {
  readonly cookout: TestCookoutService;
  readonly ada: TestIdentity;
  readonly worker: CookoutClient;
}

const owned: Effect.Effect<Owned, never, TestCookout> = Effect.gen(function* ownedWorker() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", { kind: "human" });
  const { token } = yield* cookout.createIdentity("cloud-worker", { owner: "ada" });
  return { ada, cookout, worker: cookout.clientFor(token) };
});

function approved(collected: AgentJoinCollectedResponse): AgentSessionResponse {
  if (collected.status === "approved") {
    return collected.agentSession;
  }
  return expect.unreachable("The agent join request was not approved.");
}

it.effect("join keeps a session URL, answers it to the agent and lists it for the agent's owner", () =>
  Effect.gen(function* setAtJoin() {
    const { ada, worker } = yield* owned;
    const issued = yield* answer(() => worker.join({ ...AS, sessionUrl: SESSION_URL }));
    const { agentSessions } = yield* answer(() => ada.client.listAgentSessions("cloud-worker"));

    expect(issued.sessionUrl).toBe(SESSION_URL);
    expect(agentSessions).toMatchObject([{ sessionUrl: SESSION_URL }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("join refuses a session URL that isn't an absolute http or https URL, and joins nothing", () =>
  Effect.gen(function* refusedAtJoin() {
    const { ada, worker } = yield* owned;
    const refused = yield* Effect.forEach(
      ["ftp://files.example/session", "mailto:ada@example.com", "/code/session_1", "claude.ai/code/session_1", ""],
      (sessionUrl) => refusal(() => worker.join({ ...AS, sessionUrl })),
      ONE_AT_A_TIME,
    );
    const { agentSessions } = yield* answer(() => ada.client.listAgentSessions("cloud-worker"));

    expect(refused).toMatchObject(
      Array.from(refused, () => ({ code: "invalid_request", details: [NOT_A_SESSION_URL], status: BAD_REQUEST })),
    );
    expect(agentSessions).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a session URL ends with its session: after leave the next join without one has none", () =>
  Effect.gen(function* clearedAtLeave() {
    const { ada, cookout, worker } = yield* owned;
    const first = yield* answer(() => worker.join({ ...AS, sessionUrl: SESSION_URL }));
    yield* answer(() => cookout.clientFor(first.agentSessionToken).leave());
    const afterLeave = yield* answer(() => ada.client.listAgentSessions("cloud-worker"));
    const second = yield* answer(() => worker.join(AS));
    const afterRejoin = yield* answer(() => ada.client.listAgentSessions("cloud-worker"));

    expect(afterLeave.agentSessions).toStrictEqual([]);
    expect(second).not.toHaveProperty("sessionUrl");
    expect(Arr.map(afterRejoin.agentSessions, (listed) => Predicate.hasProperty(listed, "sessionUrl"))).toStrictEqual([
      false,
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an admin who isn't the agent's owner lists its session without the session URL", () =>
  Effect.gen(function* hiddenFromAdmin() {
    const { cookout, worker } = yield* owned;
    yield* answer(() => worker.join({ ...AS, host: "cloud-box", sessionUrl: SESSION_URL }));
    const { agentSessions } = yield* answer(() => cookout.client.listAgentSessions("cloud-worker"));

    expect(
      Arr.map(agentSessions, (listed) => [listed.host, Predicate.hasProperty(listed, "sessionUrl")]),
    ).toStrictEqual([["cloud-box", false]]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent join request carries its session URL to the session it joins", () =>
  Effect.gen(function* setByJoinRequest() {
    const { ada, cookout } = yield* owned;
    const box = cookout.clientFor();
    const started = yield* answer(() =>
      box.startAgentJoin({ as: "cloud-worker", host: "cloud-box", sessionUrl: SESSION_URL }),
    );
    yield* answer(() => ada.client.approveAgentJoin(started.userCode));
    const session = yield* Effect.map(
      answer(() => box.collectAgentJoin(started.requestId)),
      approved,
    );
    const { agentSessions } = yield* answer(() => ada.client.listAgentSessions("cloud-worker"));

    expect(session.sessionUrl).toBe(SESSION_URL);
    expect(agentSessions).toMatchObject([{ host: "cloud-box", sessionUrl: SESSION_URL }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent join request refuses a session URL that isn't an absolute http or https URL", () =>
  Effect.gen(function* refusedByJoinRequest() {
    const { cookout } = yield* owned;
    const refused = yield* refusal(() =>
      cookout.clientFor().startAgentJoin({ as: "cloud-worker", host: "cloud-box", sessionUrl: "ftp://box/1" }),
    );

    expect(refused).toMatchObject({ code: "invalid_request", status: BAD_REQUEST });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("redeeming a join code keeps its session URL, answers it and lists it for the agent's owner", () =>
  Effect.gen(function* setByJoinCode() {
    const { ada, cookout } = yield* owned;
    const { joinCode } = yield* answer(() => ada.client.createJoinCode({ displayName: "Coded", name: "coded" }));
    const issued = yield* answer(() =>
      cookout.clientFor().redeemJoinCode({ host: "cloud-box", joinCode, sessionUrl: SESSION_URL }),
    );
    const { agentSessions } = yield* answer(() => ada.client.listAgentSessions("coded"));

    expect(issued.sessionUrl).toBe(SESSION_URL);
    expect(agentSessions).toMatchObject([{ host: "cloud-box", sessionUrl: SESSION_URL }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "redeeming a join code refuses a session URL that isn't an absolute http or https URL, and keeps the code",
  () =>
    Effect.gen(function* refusedByJoinCode() {
      const { ada, cookout } = yield* owned;
      const { joinCode } = yield* answer(() => ada.client.createJoinCode({ displayName: "Coded", name: "coded" }));
      const refused = yield* refusal(() => cookout.clientFor().redeemJoinCode({ joinCode, sessionUrl: "ftp://box/1" }));
      const redeemed = yield* answer(() => cookout.clientFor().redeemJoinCode({ joinCode }));

      expect(refused).toMatchObject({ code: "invalid_request", details: [NOT_A_SESSION_URL], status: BAD_REQUEST });
      expect(redeemed).not.toHaveProperty("sessionUrl");
    }).pipe(Effect.provide(testCookout())),
);
