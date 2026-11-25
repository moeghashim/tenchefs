import type { AgentJoinCollectedResponse, AgentJoinRequestStartedResponse } from "../../../agent-sessions/index.ts";
import type { CookoutClient, CookoutEvent, EventStream, InboxAgentJoinRequest } from "../../index.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Scope } from "effect";
import { createTestAgent } from "../../../testing/index.ts";

const FORBIDDEN = 403;
const NOT_FOUND = 404;
const UNAUTHORIZED = 401;
const asked = { as: "worker", host: "build-box" };

interface Board {
  readonly cookout: TestCookoutService;
  readonly ada: TestIdentity;
  readonly bob: TestIdentity;
  readonly chief: TestIdentity;
}

function started(cookout: TestCookoutService): Effect.Effect<AgentJoinRequestStartedResponse> {
  return answer(() => cookout.clientFor().startAgentJoin(asked));
}

function collect(
  cookout: TestCookoutService,
  { requestId }: AgentJoinRequestStartedResponse,
): Effect.Effect<AgentJoinCollectedResponse> {
  return answer(() => cookout.clientFor().collectAgentJoin(requestId));
}

const board: Effect.Effect<Board, never, TestCookout> = Effect.gen(function* seedBoard() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", { kind: "human" });
  const bob = yield* cookout.createIdentity("bob", { kind: "human" });
  const chief = yield* cookout.createIdentity("chief", { owner: "ada" });
  yield* answer(() => createTestAgent({ broughtIn: true, by: chief.client, displayName: "Worker", name: "worker" }));
  return { ada, bob, chief, cookout };
});

function pendingIn(client: CookoutClient): Effect.Effect<readonly InboxAgentJoinRequest[]> {
  return Effect.map(
    answer(() => client.inbox()),
    ({ agentJoinRequests }) => agentJoinRequests,
  );
}

function deniedBy(userCode: string): (client: CookoutClient) => ReturnType<typeof refusal> {
  return (client: CookoutClient) => refusal(() => client.denyAgentJoin(userCode));
}

function sessionExpiryOf(joined: AgentJoinCollectedResponse): string {
  if (joined.status === "approved") {
    return joined.agentSession.expiresAt;
  }
  return expect.unreachable("The worker's join was not approved.");
}

function joinedOnce(on: Board): Effect.Effect<string> {
  return Effect.gen(function* joinOnce() {
    const first = yield* started(on.cookout);
    yield* answer(() => on.ada.client.approveAgentJoin(first.userCode));
    const joined = yield* collect(on.cookout, first);
    return sessionExpiryOf(joined);
  });
}

function watching(client: CookoutClient): Effect.Effect<AsyncIterator<CookoutEvent>, never, Scope.Scope> {
  return Effect.map(
    Effect.acquireRelease(
      answer(() => client.watch()),
      (events: EventStream) => answer(() => events.close()),
    ),
    (events) => events[Symbol.asyncIterator](),
  );
}

function nextJoinRequestsEvent(events: AsyncIterator<CookoutEvent>): Effect.Effect<CookoutEvent | null> {
  const next = answer(() => events.next());
  return Effect.map(
    Effect.repeat(next, {
      until: (heard: Readonly<IteratorResult<CookoutEvent>>) =>
        heard.done === true || heard.value.type === "agent-join-requests",
    }),
    (heard: Readonly<IteratorResult<CookoutEvent>>) => {
      if (heard.done === true) {
        return null;
      }
      return heard.value;
    },
  );
}

it.effect("dismissing a pending join request takes it out of every approver's inbox, and its join is refused", () =>
  Effect.gen(function* dismissedGoes() {
    const { ada, chief, cookout } = yield* board;
    const request = yield* started(cookout);
    const dismissed = yield* answer(() => ada.client.denyAgentJoin(request.userCode));
    const listed = yield* Effect.forEach([ada.client, chief.client], pendingIn, { concurrency: 1 });
    const joined = yield* refusal(() => cookout.clientFor().collectAgentJoin(request.requestId));
    const approved = yield* refusal(() => chief.client.approveAgentJoin(request.userCode));

    expect(dismissed).toStrictEqual({ denied: true, userCode: request.userCode });
    expect(listed).toStrictEqual([[], []]);
    expect(joined).toMatchObject({ code: "agent_join_request_denied", status: FORBIDDEN });
    expect(approved).toMatchObject({ code: "agent_join_request_not_found", status: NOT_FOUND });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the agent that brought the agent in may dismiss its join request too", () =>
  Effect.gen(function* dismissedByChief() {
    const { ada, chief, cookout } = yield* board;
    const request = yield* started(cookout);
    yield* answer(() => chief.client.denyAgentJoin(request.userCode));
    const listed = yield* pendingIn(ada.client);

    expect(listed).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("only someone who could approve a join request may dismiss it, and a refused dismissal leaves it", () =>
  Effect.gen(function* refusedDismissal() {
    const { ada, bob, cookout } = yield* board;
    const request = yield* started(cookout);
    const refused = yield* Effect.forEach(
      [bob.client, cookout.client, cookout.clientFor()],
      deniedBy(request.userCode),
      { concurrency: 1 },
    );
    const listed = yield* pendingIn(ada.client);
    const pending = yield* collect(cookout, request);

    expect(refused).toMatchObject([{ status: NOT_FOUND }, { status: NOT_FOUND }, { status: UNAUTHORIZED }]);
    expect(listed).toMatchObject([{ userCode: request.userCode }]);
    expect(pending).toStrictEqual({ status: "pending" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a join request for an agent already joined in another session says so in the inbox, until dismissed", () =>
  Effect.gen(function* liveSaysSo() {
    const on = yield* board;
    const liveUntil = yield* joinedOnce(on);
    const second = yield* started(on.cookout);
    const listed = yield* pendingIn(on.ada.client);
    yield* answer(() => on.ada.client.denyAgentJoin(second.userCode));
    const after = yield* pendingIn(on.ada.client);

    expect(listed).toMatchObject([{ liveSessionExpiresAt: liveUntil, userCode: second.userCode }]);
    expect(after).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the owner's stream hears a dismissed join request leave", () =>
  Effect.gen(function* heardDismissed() {
    const on = yield* board;
    const events = yield* watching(on.ada.client);
    const request = yield* started(on.cookout);
    yield* nextJoinRequestsEvent(events);
    yield* answer(() => on.ada.client.denyAgentJoin(request.userCode));
    const dismissed = yield* nextJoinRequestsEvent(events);

    expect(dismissed).toStrictEqual({ agentJoinRequests: [], type: "agent-join-requests" });
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("someone whose own <name>/agent approving would join can't dismiss another owner's join request", () =>
  Effect.gen(function* namespacedRefused() {
    const { ada, bob, cookout } = yield* board;
    yield* cookout.createIdentity("bob/worker", { owner: "bob" });
    const request = yield* started(cookout);
    const refused = yield* refusal(() => bob.client.denyAgentJoin(request.userCode));
    const listed = yield* pendingIn(ada.client);

    expect(refused).toMatchObject({ code: "not_owner", status: FORBIDDEN });
    expect(listed).toMatchObject([{ userCode: request.userCode }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an approved join request can't be dismissed, and its join still collects", () =>
  Effect.gen(function* approvedStays() {
    const { ada, cookout } = yield* board;
    const request = yield* started(cookout);
    yield* answer(() => ada.client.approveAgentJoin(request.userCode));
    const refused = yield* refusal(() => ada.client.denyAgentJoin(request.userCode));
    const joined = yield* collect(cookout, request);

    expect(refused).toMatchObject({ code: "agent_join_request_not_found", status: NOT_FOUND });
    expect(joined).toMatchObject({ agentSession: { identity: "worker" }, status: "approved" });
  }).pipe(Effect.provide(testCookout())),
);
