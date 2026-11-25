import type { CookoutClient, CookoutEvent, EventStream } from "../../index.ts";
import { Effect, Predicate } from "effect";
import { TestCookout, answer, pastOwnPresence, refusal, testCookout, twoSessions } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import type { TestCookoutService } from "../../../testing/server.ts";

const AGENT = "auth-griller";
const ADMIN = "admin";
const HUMAN = { kind: "human" } as const;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const REPLACED = { code: "watch_replaced", message: "replaced by another watch" } as const;

type Feed = AsyncIterator<CookoutEvent, unknown>;

type Credential = "agent session token" | "Identity token";

interface Clients {
  readonly agentSession: CookoutClient;
  readonly identity: CookoutClient;
}

function feedOf(client: CookoutClient, allChannels = false): Effect.Effect<Feed, never, Scope.Scope> {
  return Effect.map(
    Effect.acquireRelease(
      answer(() => client.watch({ allChannels })),
      (events: EventStream) => answer(() => events.close()),
    ),
    (events) => events[Symbol.asyncIterator](),
  );
}

function eventIn(next: Readonly<IteratorResult<CookoutEvent, unknown>>): CookoutEvent | null {
  if (next.done === true) {
    return null;
  }
  return next.value;
}

function nextOfType(feed: Feed, type: CookoutEvent["type"]): Effect.Effect<CookoutEvent | null> {
  return answer(() => feed.next()).pipe(
    Effect.map(eventIn),
    Effect.repeat({ until: (event) => Predicate.isNull(event) || event.type === type }),
  );
}

function presenceEventsUntilLater(
  feed: Feed,
  later: CookoutClient,
): Effect.Effect<readonly (CookoutEvent | null)[], never, Scope.Scope> {
  return Effect.gen(function* readUntilLaterArrives() {
    yield* TestClock.adjust("2 minutes");
    yield* feedOf(later);
    return yield* Effect.all([nextOfType(feed, "presence"), nextOfType(feed, "presence")], ONE_AT_A_TIME);
  });
}

function agentClients(cookout: TestCookoutService): Effect.Effect<Clients> {
  return Effect.gen(function* joinAgent() {
    const { first } = yield* twoSessions(cookout);
    const issued = yield* answer(() => first.join({ as: AGENT }));
    return { agentSession: cookout.clientFor(issued.agentSessionToken), identity: first };
  });
}

function clientWith(clients: Clients, credential: Credential): CookoutClient {
  if (credential === "Identity token") {
    return clients.identity;
  }
  return clients.agentSession;
}

it.effect("a second stream for an agent ends the first with watch_replaced, and the agent never shows offline", () =>
  Effect.gen(function* secondWatchReplacesFirst() {
    const cookout = yield* TestCookout;
    const agent = yield* cookout.createIdentity(AGENT);
    const bob = yield* cookout.createIdentity("bob", HUMAN);
    const feed = yield* Effect.tap(feedOf(cookout.client, true), (events) => pastOwnPresence({ events, name: ADMIN }));
    const first = yield* feedOf(agent.client);
    yield* feedOf(agent.client);
    const ended = yield* refusal(() => first.next());
    const events = yield* presenceEventsUntilLater(feed, bob.client);

    expect(ended).toMatchObject(REPLACED);
    expect(events).toMatchObject([
      { presence: { identity: AGENT, online: true } },
      { presence: { identity: "bob", online: true } },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect.each<readonly [Credential, Credential]>([
  ["agent session token", "Identity token"],
  ["Identity token", "agent session token"],
])("a stream sent with the %s is replaced by one sent with the %s, and the agent stays online", ([first, second]) =>
  Effect.gen(function* replacedAcrossCredentials() {
    const cookout = yield* TestCookout;
    const clients = yield* agentClients(cookout);
    const replaced = yield* feedOf(clientWith(clients, first));
    yield* feedOf(clientWith(clients, second));
    const ended = yield* refusal(() => replaced.next());
    yield* TestClock.adjust("2 minutes");
    const { presence } = yield* answer(() => cookout.client.presence());

    expect(ended).toMatchObject(REPLACED);
    expect(presence).toContainEqual(expect.objectContaining({ identity: AGENT, online: true }));
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a human opening a second stream keeps both open", () =>
  Effect.gen(function* humanKeepsBoth() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann", HUMAN);
    const firstTab = yield* feedOf(ann.client, true);
    const secondTab = yield* feedOf(ann.client, true);
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    yield* answer(() => cookout.client.createMessage({ channel: "grill", text: "both tabs hear this" }));
    const heard = yield* Effect.all([nextOfType(firstTab, "message"), nextOfType(secondTab, "message")], ONE_AT_A_TIME);

    expect(heard).toMatchObject([
      { message: { text: "both tabs hear this" }, type: "message" },
      { message: { text: "both tabs hear this" }, type: "message" },
    ]);
  }).pipe(Effect.provide(testCookout())),
);
