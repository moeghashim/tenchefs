import type { AgentJoinRequestStartedResponse, StartAgentJoinRequest } from "../../../agent-sessions/index.ts";
import { Array as Arr, Effect } from "effect";
import type { CookoutClient, CookoutEvent, EventStream, InboxAgentJoinRequest } from "../../index.ts";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import { createTestAgent } from "../../../testing/index.ts";

const SETTLE = "30 millis";
const ALMOST_DELAY = "179 seconds";
const LAST_SECOND = "1 second";
const asked = { as: "worker", host: "build-box" };
const ONE_AT_A_TIME = { concurrency: 1 } as const;

interface Board {
  readonly cookout: TestCookoutService;
  readonly ada: TestIdentity;
  readonly chief: TestIdentity;
}

const settled: Effect.Effect<void> = TestClock.withLive(Effect.sleep(SETTLE));

const board: Effect.Effect<Board, never, TestCookout> = Effect.gen(function* seedBoard() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", { kind: "human" });
  const chief = yield* cookout.createIdentity("chief", { owner: "ada" });
  yield* answer(() => createTestAgent({ broughtIn: true, by: chief.client, displayName: "Worker", name: "worker" }));
  return { ada, chief, cookout };
});

function started(
  cookout: TestCookoutService,
  request: StartAgentJoinRequest = asked,
): Effect.Effect<AgentJoinRequestStartedResponse> {
  return answer(() => cookout.clientFor().startAgentJoin(request));
}

function codesIn(client: CookoutClient): Effect.Effect<readonly string[]> {
  return Effect.map(
    answer(() => client.inbox()),
    ({ agentJoinRequests }) => Arr.map(agentJoinRequests, ({ userCode }) => userCode),
  );
}

function codesInEach(clients: readonly CookoutClient[]): Effect.Effect<readonly (readonly string[])[]> {
  return Effect.forEach(clients, codesIn, ONE_AT_A_TIME);
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

function nextJoinRequests(events: AsyncIterator<CookoutEvent>): Effect.Effect<readonly InboxAgentJoinRequest[]> {
  const next = answer(() => events.next());
  return Effect.map(
    Effect.repeat(next, {
      until: (heard: Readonly<IteratorResult<CookoutEvent>>) =>
        heard.done === true || heard.value.type === "agent-join-requests",
    }),
    (heard: Readonly<IteratorResult<CookoutEvent>>) => {
      if (heard.done !== true && heard.value.type === "agent-join-requests") {
        return heard.value.agentJoinRequests;
      }
      return expect.unreachable("The stream ended before it heard the join requests.");
    },
  );
}

it.effect(
  "a join request for an agent another agent brought in reaches its owner only after 3 minutes pending, and that agent at once",
  () =>
    Effect.gen(function* delayedForPeople() {
      const { ada, chief, cookout } = yield* board;
      const { userCode } = yield* started(cookout);
      const atOnce = yield* codesInEach([ada.client, chief.client]);
      yield* TestClock.adjust(ALMOST_DELAY);
      const at259 = yield* codesInEach([ada.client, chief.client]);
      yield* TestClock.adjust(LAST_SECOND);
      const at300 = yield* codesInEach([ada.client, chief.client]);

      expect([atOnce, at259, at300]).toStrictEqual([
        [[], [userCode]],
        [[], [userCode]],
        [[userCode], [userCode]],
      ]);
    }).pipe(Effect.provide(testCookout())),
);

it.effect("a join request for an agent a person owns reaches that person at once", () =>
  Effect.gen(function* personOwnedAtOnce() {
    const { ada, cookout } = yield* board;
    yield* answer(() => createTestAgent({ by: ada.client, displayName: "Helper", name: "helper" }));
    const { userCode } = yield* started(cookout, { as: "helper", host: "ada-box" });
    const listed = yield* codesIn(ada.client);

    expect(listed).toStrictEqual([userCode]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the owner can still open and approve a brought-in agent's join request by its code before 3 minutes", () =>
  Effect.gen(function* approvedAtOnce() {
    const { ada, cookout } = yield* board;
    const { userCode } = yield* started(cookout);
    const shown = yield* answer(() => ada.client.getAgentJoinRequest(userCode));
    const approved = yield* answer(() => ada.client.approveAgentJoin(userCode));

    expect([shown, approved]).toMatchObject([
      { agentJoinRequest: { approved: false, joins: "worker" } },
      { agentJoinRequest: { approved: true, joins: "worker" } },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the owner's stream hears a brought-in agent's join request once it has been pending 3 minutes", () =>
  Effect.gen(function* heardAfterDelay() {
    const { ada, chief, cookout } = yield* board;
    const [owner, bringer] = yield* Effect.all([watching(ada.client), watching(chief.client)], ONE_AT_A_TIME);
    const { userCode } = yield* started(cookout);
    const [bringerHeard, ownerFirst] = yield* Effect.all(
      [nextJoinRequests(bringer), nextJoinRequests(owner)],
      ONE_AT_A_TIME,
    );
    const waited = Effect.andThen(settled, TestClock.adjust(ALMOST_DELAY));
    const ownerLater = yield* Effect.andThen(
      Effect.andThen(waited, TestClock.adjust(LAST_SECOND)),
      nextJoinRequests(owner),
    );

    expect(bringerHeard).toMatchObject([{ userCode }]);
    expect(ownerFirst).toStrictEqual([]);
    expect(ownerLater).toMatchObject([{ agent: { name: "worker" }, userCode }]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);
