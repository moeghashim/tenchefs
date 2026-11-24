import type {
  AgentJoinCollectedResponse,
  AgentJoinRequestStartedResponse,
  StartAgentJoinRequest,
} from "../../../agent-sessions/index.ts";
import type { AgentSessionResponse, Identity } from "../../index.ts";
import { Duration, Effect } from "effect";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { TestClock } from "effect/testing";
import { token } from "../../../identities/index.ts";

const NOT_FOUND = 404;
const FORBIDDEN = 403;
const BAD_REQUEST = 400;
const CONFLICT = 409;
const LIFETIME_MINUTES = 10;
const THREE = 3;
const asked = { as: "triage-agent", host: "build-box" };

interface Started {
  readonly cookout: TestCookoutService;
  readonly ada: TestIdentity;
  readonly started: AgentJoinRequestStartedResponse;
}

function startedFor(request: StartAgentJoinRequest): Effect.Effect<Started, never, TestCookout> {
  return Effect.gen(function* startForAda() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const started = yield* answer(() => cookout.clientFor().startAgentJoin(request));
    return { ada, cookout, started };
  });
}

function collected({ cookout, started }: Started): Effect.Effect<AgentJoinCollectedResponse> {
  return answer(() => cookout.clientFor().collectAgentJoin(started.requestId));
}

function sessionOf(response: AgentJoinCollectedResponse): AgentSessionResponse {
  if (response.status === "approved") {
    return response.agentSession;
  }
  return expect.unreachable("The agent join request was not approved.");
}

function approvedSession(on: Started): Effect.Effect<AgentSessionResponse> {
  return Effect.gen(function* approveAndCollect() {
    yield* answer(() => on.ada.client.approveAgentJoin(on.started.userCode));
    return yield* Effect.map(collected(on), sessionOf);
  });
}

function whoIs(cookout: TestCookoutService, session: AgentSessionResponse): Effect.Effect<Identity> {
  return Effect.map(answer(cookout.clientFor(session.agentSessionToken).whoami), ({ identity }) => identity);
}

function notFoundThrice(): readonly object[] {
  return Array.from({ length: THREE }, () => ({ code: "agent_join_request_not_found", status: NOT_FOUND }));
}

it.effect("an agent join request is pending until a human approves it, then joins an agent they own", () =>
  Effect.gen(function* approveFlow() {
    const on = yield* startedFor({ ...asked, idleExpiry: "30d" });
    const pending = yield* collected(on);
    const shown = yield* answer(() => on.ada.client.getAgentJoinRequest(on.started.userCode));
    const session = yield* approvedSession(on);
    const actingAs = yield* whoIs(on.cookout, session);

    expect([on.started.approvalPath, on.started.expiresAt, pending]).toStrictEqual([
      `/#/approve-join/${on.started.userCode}`,
      "2026-01-01T00:10:00.000Z",
      { status: "pending" },
    ]);
    expect(shown.agentJoinRequest).toStrictEqual({
      ...asked,
      approved: false,
      creates: true,
      expiresAt: on.started.expiresAt,
      idleExpiry: "30d",
      joins: "triage-agent",
      userCode: on.started.userCode,
    });
    expect(session).toMatchObject({ created: true, expiresAt: "2026-01-31T00:00:00.000Z", identity: "triage-agent" });
    expect(actingAs).toMatchObject({ kind: "agent", name: "triage-agent", owner: "ada" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the collected answer holds only the agent session token, never a human's credential", () =>
  Effect.gen(function* answerShape() {
    const on = yield* startedFor(asked);
    yield* answer(() => on.ada.client.approveAgentJoin(on.started.userCode));
    const response = yield* collected(on);
    const session = sessionOf(response);

    const { agentSessionToken } = session;
    const onlyTheSession = { agentSessionToken, created: true, expiresAt: "2026-01-08T00:00:00.000Z" };

    expect(response).toStrictEqual({
      agentSession: { ...onlyTheSession, identity: "triage-agent", issuedAt: "2026-01-01T00:00:00.000Z" },
      status: "approved",
    });
    expect(agentSessionToken).not.toBe(on.ada.token);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("approving joins the approver's own agent, or <approver>/<name> when the name is someone else's", () =>
  Effect.gen(function* resolution() {
    const on = yield* startedFor(asked);
    yield* on.cookout.createIdentity("grace", { kind: "human" });
    yield* on.cookout.createIdentity("triage-agent", { owner: "grace" });
    const namespaced = yield* approvedSession(on);
    const again = yield* answer(() => on.cookout.clientFor().startAgentJoin(asked));
    yield* answer(() => on.cookout.clientFor(namespaced.agentSessionToken).leave());
    const owned = yield* approvedSession({ ...on, started: again });

    expect([namespaced, owned]).toMatchObject([
      { created: true, identity: "ada/triage-agent" },
      { created: false, identity: "ada/triage-agent" },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent join request for a human's name, or another human's namespace, is refused", () =>
  Effect.gen(function* refusedNames() {
    const on = yield* startedFor({ ...asked, as: "grace" });
    yield* on.cookout.createIdentity("grace", { kind: "human" });
    const human = yield* refusal(() => on.ada.client.approveAgentJoin(on.started.userCode));
    const other = yield* answer(() => on.cookout.clientFor().startAgentJoin({ ...asked, as: "grace/bot" }));
    const notOwned = yield* refusal(() => on.ada.client.getAgentJoinRequest(other.userCode));

    expect([human, notOwned]).toMatchObject([
      { code: "identity_kind", status: FORBIDDEN },
      { code: "not_owner", status: FORBIDDEN },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the approver may lower the idle expiry asked for, but never raise it", () =>
  Effect.gen(function* lowered() {
    const on = yield* startedFor({ ...asked, idleExpiry: "30d" });
    const raised = yield* refusal(() => on.ada.client.approveAgentJoin(on.started.userCode, { idleExpiry: "31d" }));
    const approved = yield* answer(() => on.ada.client.approveAgentJoin(on.started.userCode, { idleExpiry: "7d" }));
    const session = yield* Effect.map(collected(on), sessionOf);

    expect(raised).toMatchObject({
      code: "idle_expiry_too_long",
      details: { maxIdleExpiry: "30d" },
      status: BAD_REQUEST,
    });
    expect(approved.agentJoinRequest).toMatchObject({ approved: true, creates: true, idleExpiry: "7d" });
    expect(session.expiresAt).toBe("2026-01-08T00:00:00.000Z");
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent join request can't ask past the board's ceiling, and without asking gets the default", () =>
  Effect.gen(function* ceiling() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const tooLong = yield* refusal(() => cookout.clientFor().startAgentJoin({ ...asked, idleExpiry: "2d" }));
    const started = yield* answer(() => cookout.clientFor().startAgentJoin(asked));
    const shown = yield* answer(() => ada.client.getAgentJoinRequest(started.userCode));

    expect(tooLong).toMatchObject({ code: "idle_expiry_too_long", details: { maxIdleExpiry: "1d" } });
    expect(shown.agentJoinRequest.idleExpiry).toBe("1d");
  }).pipe(Effect.provide(testCookout({ maxIdleExpiry: "1d" }))),
);

it.effect("approving for an agent with a live agent session token replaces it only when the approver forces it", () =>
  Effect.gen(function* replace() {
    const on = yield* startedFor(asked);
    const first = yield* approvedSession(on);
    const again = yield* answer(() => on.cookout.clientFor().startAgentJoin(asked));
    const shown = yield* answer(() => on.ada.client.getAgentJoinRequest(again.userCode));
    const live = yield* refusal(() => on.ada.client.approveAgentJoin(again.userCode));
    yield* answer(() => on.ada.client.approveAgentJoin(again.userCode, { force: true }));
    const second = yield* Effect.flatMap(collected({ ...on, started: again }), (response) =>
      whoIs(on.cookout, sessionOf(response)),
    );
    const replaced = yield* refusal(on.cookout.clientFor(first.agentSessionToken).whoami);

    expect(shown.agentJoinRequest).toMatchObject({ creates: false, liveSessionExpiresAt: first.expiresAt });
    expect([live, second, replaced]).toMatchObject([
      { code: "agent_session_live", status: CONFLICT },
      { name: "triage-agent" },
      { code: "agent_session_revoked" },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent join request is collected once, and never with the user code alone", () =>
  Effect.gen(function* collectOnce() {
    const on = yield* startedFor(asked);
    yield* approvedSession(on);
    const anonymous = on.cookout.clientFor();
    const again = yield* refusal(() => anonymous.collectAgentJoin(on.started.requestId));
    const byCode = yield* refusal(() => anonymous.collectAgentJoin(token(on.started.userCode)));
    const wrong = yield* refusal(() => anonymous.collectAgentJoin(token("cookout_not-a-request")));

    expect([again, byCode, wrong]).toMatchObject(notFoundThrice());
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an unapproved agent join request expires after 10 minutes", () =>
  Effect.gen(function* expires() {
    const on = yield* startedFor(asked);
    yield* TestClock.adjust(Duration.minutes(LIFETIME_MINUTES));
    const gone = yield* refusal(() => on.cookout.clientFor().collectAgentJoin(on.started.requestId));
    const shown = yield* refusal(() => on.ada.client.getAgentJoinRequest(on.started.userCode));
    const approved = yield* refusal(() => on.ada.client.approveAgentJoin(on.started.userCode));

    expect([gone, shown, approved]).toMatchObject(notFoundThrice());
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an approved request collected after another session joined the agent is refused, not forced", () =>
  Effect.gen(function* joinedMeanwhile() {
    const on = yield* startedFor(asked);
    yield* answer(() => on.ada.client.approveAgentJoin(on.started.userCode));
    yield* answer(() => on.ada.client.join({ as: "triage-agent" }));
    const refused = yield* refusal(() => on.cookout.clientFor().collectAgentJoin(on.started.requestId));

    expect(refused).toMatchObject({ code: "agent_session_live", status: CONFLICT });
  }).pipe(Effect.provide(testCookout())),
);
