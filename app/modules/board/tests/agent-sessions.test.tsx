import type { CookoutClient, IdentityName, ListAgentSessionsResponse } from "../../sdk/index.ts";
import { agentSessions, createBoardStore } from "../index.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import type { BoardStore } from "../index.ts";
import type { HandLive } from "../../testing/web.ts";
import type { Live } from "../../live/index.ts";
import type { Mock } from "vitest";
import { createCookoutClient } from "../../sdk/index.ts";
import { createLive } from "../../live/index.ts";
import { handLive } from "../../testing/web.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

const OPENINGS = 20;
const NONE = 0;
const ONE = 1;
const TWO = 2;
const PAST_A_TICK = 1200;

interface Agent {
  readonly name: IdentityName;
  readonly client: CookoutClient;
}

interface Opened {
  readonly store: BoardStore;
  readonly hand: HandLive;
}

function adminClient(): CookoutClient {
  return createCookoutClient({ env: {}, token: webTestCookout().adminToken, url: webTestCookout().url });
}

async function agentNamed(name: string): Promise<Agent> {
  const { identity, token } = await adminClient().createIdentity({ kind: "agent", name, owner: "admin" });
  return { client: createCookoutClient({ env: {}, token, url: webTestCookout().url }), name: identity.name };
}

async function join(agent: Agent): Promise<void> {
  await agent.client.join({ as: agent.name, host: "store-box" });
}

async function joinedAgent(name: string): Promise<Agent> {
  const agent = await agentNamed(name);
  await join(agent);
  return agent;
}

async function listedFor(name: string): Promise<ListAgentSessionsResponse> {
  const answer = await adminClient().listAgentSessions(name);
  return answer;
}

function show(store: BoardStore, agent: IdentityName): void {
  onTestFinished(store.subscribeShowingSessions(agent)(vi.fn<() => void>()));
}

function unshown(client: CookoutClient = adminClient()): Opened {
  const hand = handLive();
  return { hand, store: createBoardStore({ client, live: createLive(hand.adapter), url: webTestCookout().url }) };
}

function opened(agent: IdentityName, client: CookoutClient = adminClient()): Opened {
  const found = unshown(client);
  show(found.store, agent);
  return found;
}

function countOf(store: BoardStore, agent: IdentityName): number | null {
  const sessions = agentSessions(agent)(store.snapshot());
  if (sessions === null) {
    return null;
  }
  return sessions.length;
}

async function sessionCount(store: BoardStore, agent: IdentityName, count: number | null): Promise<void> {
  await vi.waitFor(() => {
    expect(countOf(store, agent)).toBe(count);
  });
}

async function shownThenHidden(store: BoardStore, agent: IdentityName): Promise<void> {
  const hide = store.subscribeShowingSessions(agent)(vi.fn<() => void>());
  await sessionCount(store, agent, NONE);
  hide();
}

it("an agent-session event for the agent reads its sessions again, so one it joined shows", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("store-sessions-event-bot");
  const { hand, store } = opened(agent.name);
  await sessionCount(store, agent.name, NONE);
  await join(agent);
  hand.send({ agent: agent.name, type: "agent-session" });

  await expect(sessionCount(store, agent.name, ONE)).resolves.toBeUndefined();
});

it("an identity event for the agent reads its sessions again, so a session ended by deactivating goes", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("store-sessions-identity-bot");
  await join(agent);
  const { hand, store } = opened(agent.name);
  await sessionCount(store, agent.name, ONE);
  const { identity } = await adminClient().deactivateIdentity(agent.name);
  hand.send({ identity, type: "identity" });

  await expect(sessionCount(store, agent.name, NONE)).resolves.toBeUndefined();
});

it("when the link comes back, an agent's sessions are read again, so one it joined in the gap shows", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("store-sessions-gap-bot");
  const { hand, store } = opened(agent.name);
  await sessionCount(store, agent.name, NONE);
  hand.report("down");
  await join(agent);
  hand.report("up");

  await expect(sessionCount(store, agent.name, ONE)).resolves.toBeUndefined();
});

function refusingAfterFirst(): Mock<CookoutClient["listAgentSessions"]> {
  const listAgentSessions = vi.fn<CookoutClient["listAgentSessions"]>().mockRejectedValue(new Error("unreachable"));
  return listAgentSessions.mockImplementationOnce(listedFor);
}

function fakeTicks(): void {
  vi.useFakeTimers({ toFake: ["setInterval"] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
}

it("an event or a link back while nobody shows an agent's sessions reads nothing", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("store-sessions-hidden-bot");
  const listAgentSessions = vi.fn<CookoutClient["listAgentSessions"]>(listedFor);
  const { hand, store } = unshown({ ...adminClient(), listAgentSessions });
  await shownThenHidden(store, agent.name);
  hand.send({ agent: agent.name, type: "agent-session" });
  hand.report("down");
  hand.report("up");

  expect(listAgentSessions).toHaveBeenCalledTimes(ONE);
});

it("an agent's sessions shown again after an event nobody showed them for are read again", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("store-sessions-again-bot");
  const { hand, store } = unshown();
  await shownThenHidden(store, agent.name);
  await join(agent);
  hand.send({ agent: agent.name, type: "agent-session" });
  show(store, agent.name);

  await expect(sessionCount(store, agent.name, ONE)).resolves.toBeUndefined();
});

it("opening and closing a profile many times leaves one stream listener for agent sessions", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("store-sessions-listener-bot");
  const live = createLive(handLive().adapter);
  const subscribe = vi.fn<Live["subscribe"]>(live.subscribe);
  const store = createBoardStore({ client: adminClient(), live: { ...live, subscribe }, url: webTestCookout().url });
  for (let opening = NONE; opening < OPENINGS; opening += ONE) {
    store.subscribeShowingSessions(agent.name)(vi.fn<() => void>())();
  }
  show(store, agent.name);
  await sessionCount(store, agent.name, NONE);

  expect(subscribe).toHaveBeenCalledTimes(ONE);
});

it("once one of an agent's sessions expires, its sessions are read again", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("store-sessions-expiry-bot");
  await join(agent);
  const { agentSessions: listed } = await listedFor(agent.name);
  const expired = listed.map(({ issuedAt }) => ({ expiresAt: issuedAt, issuedAt }));
  const listAgentSessions = vi
    .fn<CookoutClient["listAgentSessions"]>()
    .mockResolvedValueOnce({ agentSessions: expired })
    .mockResolvedValue({ agentSessions: [] });
  const { store } = opened(agent.name, { ...adminClient(), listAgentSessions });
  await sessionCount(store, agent.name, ONE);

  await expect(sessionCount(store, agent.name, NONE)).resolves.toBeUndefined();
});

it("an agent's sessions the server refuses to list on a read again are unknown, and not read again each second", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const agent = await joinedAgent("store-sessions-refused-bot");
  const listAgentSessions = refusingAfterFirst();
  fakeTicks();
  const { hand, store } = opened(agent.name, { ...adminClient(), listAgentSessions });
  await sessionCount(store, agent.name, ONE);
  hand.send({ agent: agent.name, type: "agent-session" });
  await sessionCount(store, agent.name, null);
  vi.advanceTimersByTime(PAST_A_TICK);

  expect([countOf(store, agent.name), listAgentSessions.mock.calls.length]).toStrictEqual([null, TWO]);
});
