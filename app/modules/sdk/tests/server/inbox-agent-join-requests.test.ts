import type {
  AgentJoinCollectedResponse,
  AgentJoinRequestStartedResponse,
  StartAgentJoinRequest,
} from "../../../agent-sessions/index.ts";
import type { CookoutClient, CookoutEvent, EventStream, InboxAgentJoinRequest } from "../../index.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import { createTestAgent } from "../../../testing/index.ts";

const CONFLICT = 409;
const SETTLE = "30 millis";
const UNAUTHORIZED = 401;
const LIFETIME = "10 minutes";
const ALMOST_LIFETIME = "9 minutes";
const LAST_MINUTE = "1 minute";
const asked = { as: "worker", host: "build-box" };

interface Board {
  readonly cookout: TestCookoutService;
  readonly ada: TestIdentity;
  readonly bob: TestIdentity;
  readonly chief: TestIdentity;
}

const settled: Effect.Effect<void> = TestClock.withLive(Effect.sleep(SETTLE));

function started(
  cookout: TestCookoutService,
  request: StartAgentJoinRequest = asked,
): Effect.Effect<AgentJoinRequestStartedResponse> {
  return answer(() => cookout.clientFor().startAgentJoin(request));
}

function collect(
  cookout: TestCookoutService,
  { requestId }: AgentJoinRequestStartedResponse,
): Effect.Effect<AgentJoinCollectedResponse> {
  return answer(() => cookout.clientFor().collectAgentJoin(requestId));
}

function sessionTokenOf(joined: AgentJoinCollectedResponse): string {
  if (joined.status === "approved") {
    return joined.agentSession.agentSessionToken;
  }
  return expect.unreachable("The worker's first join was not approved.");
}

function workerBroughtInBy(cookout: TestCookoutService, chief: TestIdentity): Effect.Effect<void> {
  return Effect.gen(function* bringInWorker() {
    yield* answer(() => createTestAgent({ broughtIn: true, by: chief.client, displayName: "Worker", name: "worker" }));
    const first = yield* started(cookout);
    yield* answer(() => chief.client.approveAgentJoin(first.userCode));
    const sessionToken = yield* Effect.map(
      answer(() => cookout.clientFor().collectAgentJoin(first.requestId)),
      sessionTokenOf,
    );
    yield* answer(() => cookout.clientFor(sessionToken).leave());
  });
}

const board: Effect.Effect<Board, never, TestCookout> = Effect.gen(function* seedBoard() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", { kind: "human" });
  const bob = yield* cookout.createIdentity("bob", { kind: "human" });
  const chief = yield* cookout.createIdentity("chief", { owner: "ada" });
  yield* workerBroughtInBy(cookout, chief);
  return { ada, bob, chief, cookout };
});

function codeOf(items: readonly InboxAgentJoinRequest[]): string {
  const [item = null] = items;
  if (item === null) {
    return expect.unreachable("No join request is in the inbox.");
  }
  return item.userCode;
}

function pendingIn(client: CookoutClient): Effect.Effect<readonly InboxAgentJoinRequest[]> {
  return Effect.map(
    answer(() => client.inbox()),
    ({ agentJoinRequests }) => agentJoinRequests,
  );
}

function pendingInEach(
  clients: readonly CookoutClient[],
): Effect.Effect<readonly (readonly InboxAgentJoinRequest[])[]> {
  return Effect.forEach(clients, pendingIn, { concurrency: 1 });
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

it.effect("a pending join request shows in the inbox of the agent's owner and of the agent that brought it in", () =>
  Effect.gen(function* whoSeesIt() {
    const { ada, bob, chief, cookout } = yield* board;
    const request = yield* started(cookout);
    const [owner, broughtInBy, other, admin] = yield* pendingInEach([
      ada.client,
      chief.client,
      bob.client,
      cookout.client,
    ]);

    expect(owner).toMatchObject([
      {
        agent: { broughtInBy: "chief", kind: "agent", name: "worker", owner: "ada" },
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: request.expiresAt,
        host: "build-box",
        text: "@worker asks to join from build-box.",
        userCode: request.userCode,
      },
    ]);
    expect([broughtInBy, other, admin]).toStrictEqual([owner, [], []]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a join request for an agent deactivated since it was made shows in no inbox", () =>
  Effect.gen(function* nobodySeesIt() {
    const { ada, bob, chief, cookout } = yield* board;
    yield* started(cookout);
    yield* answer(() => ada.client.deactivateIdentity("worker"));
    const listed = yield* pendingInEach([ada.client, chief.client, bob.client, cookout.client]);

    expect(listed).toStrictEqual([[], [], [], []]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("approving by the item's code, under the approve-join rules, takes the request out of every inbox", () =>
  Effect.gen(function* approvedGoes() {
    const { ada, chief, cookout } = yield* board;
    const request = yield* started(cookout);
    const code = yield* Effect.map(pendingIn(ada.client), codeOf);
    const refusedWithoutToken = yield* refusal(() => cookout.clientFor().approveAgentJoin(code));
    yield* answer(() => chief.client.approveAgentJoin(code));
    const listed = yield* pendingInEach([ada.client, chief.client]);
    const joined = yield* collect(cookout, request);

    expect(refusedWithoutToken).toMatchObject({ status: UNAUTHORIZED });
    expect(listed).toStrictEqual([[], []]);
    expect(joined).toMatchObject({ agentSession: { identity: "worker" }, status: "approved" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a refused approval, for an agent whose session is live, leaves the request in the inbox", () =>
  Effect.gen(function* refusedStays() {
    const { ada, cookout } = yield* board;
    const first = yield* started(cookout);
    yield* answer(() => ada.client.approveAgentJoin(first.userCode));
    yield* collect(cookout, first);
    const second = yield* started(cookout);
    const refused = yield* refusal(() => ada.client.approveAgentJoin(second.userCode));
    const listed = yield* pendingIn(ada.client);

    expect(refused).toMatchObject({ code: "agent_session_live", status: CONFLICT });
    expect(listed).toMatchObject([{ userCode: second.userCode }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a join request leaves the inbox when it expires, unapproved, after 10 minutes", () =>
  Effect.gen(function* expiredGoes() {
    const { ada, chief, cookout } = yield* board;
    yield* started(cookout);
    yield* TestClock.adjust(ALMOST_LIFETIME);
    const before = yield* pendingInEach([ada.client, chief.client]);
    yield* TestClock.adjust(LAST_MINUTE);
    const after = yield* pendingInEach([ada.client, chief.client]);

    expect(before).toMatchObject([[{ host: "build-box" }], [{ host: "build-box" }]]);
    expect(after).toStrictEqual([[], []]);
  }).pipe(Effect.provide(testCookout())),
);

function startedAgainAfterJoining(on: Board, first: AgentJoinRequestStartedResponse): Effect.Effect<void> {
  return Effect.gen(function* joinThenAskAgain() {
    yield* collect(on.cookout, first);
    yield* answer(() => on.ada.client.revokeAgentSession("worker"));
    yield* started(on.cookout);
  });
}

it.effect("the owner's stream hears the pending join requests as one starts, is approved, and expires", () =>
  Effect.gen(function* heardLive() {
    const on = yield* board;
    const events = yield* watching(on.ada.client);
    const first = yield* started(on.cookout);
    const raised = yield* nextJoinRequestsEvent(events);
    const approved = yield* Effect.andThen(
      answer(() => on.chief.client.approveAgentJoin(first.userCode)),
      nextJoinRequestsEvent(events),
    );
    yield* Effect.andThen(startedAgainAfterJoining(on, first), nextJoinRequestsEvent(events));
    const expire = Effect.andThen(settled, TestClock.adjust(LIFETIME));
    const expired = yield* Effect.andThen(expire, nextJoinRequestsEvent(events));

    expect(raised).toMatchObject({
      agentJoinRequests: [{ agent: { name: "worker" }, userCode: first.userCode }],
      type: "agent-join-requests",
    });
    expect([approved, expired]).toStrictEqual([
      { agentJoinRequests: [], type: "agent-join-requests" },
      { agentJoinRequests: [], type: "agent-join-requests" },
    ]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("a stream hears only the join requests its caller may approve", () =>
  Effect.gen(function* heardOnlyOwn() {
    const { bob, cookout } = yield* board;
    yield* cookout.createIdentity("bob/scout", { owner: "bob" });
    const events = yield* watching(bob.client);
    yield* started(cookout);
    const own = yield* started(cookout, { as: "bob/scout", host: "bob-box" });
    const heard = yield* nextJoinRequestsEvent(events);

    expect(heard).toMatchObject({ agentJoinRequests: [{ host: "bob-box", userCode: own.userCode }] });
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);
