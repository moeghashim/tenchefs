import type { CookoutClient, IdentityName, Presence } from "../../sdk/index.ts";
import { createBoardStore, presences } from "../index.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import type { BoardStore } from "../index.ts";
import type { HandLive } from "../../testing/web.ts";
import { createCookoutClient } from "../../sdk/index.ts";
import { createLive } from "../../live/index.ts";
import { handLive } from "../../testing/web.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

const NOBODY = 0;

type PresenceClient = Pick<CookoutClient, "presence">;

interface Agent {
  readonly name: IdentityName;
  readonly client: CookoutClient;
}

interface Opened {
  readonly store: BoardStore;
  readonly hand: HandLive;
}

interface Expected {
  readonly name: IdentityName;
  readonly online: boolean;
}

function adminClient(): CookoutClient {
  return createCookoutClient({ env: {}, token: webTestCookout().adminToken, url: webTestCookout().url });
}

async function agentNamed(name: string): Promise<Agent> {
  const { identity, token } = await adminClient().createIdentity({ kind: "agent", name, owner: "admin" });
  return { client: createCookoutClient({ env: {}, token, url: webTestCookout().url }), name: identity.name };
}

async function goOnline(agent: Agent): Promise<() => Promise<void>> {
  const events = await agent.client.watch();
  onTestFinished(events.close);
  return events.close;
}

function show(store: BoardStore): void {
  const unsubscribe = store.subscribeShowing("presence")(vi.fn<() => void>());
  onTestFinished(() => {
    unsubscribe();
  });
}

interface Counting {
  readonly client: PresenceClient;
  readonly reads: () => readonly string[];
}

function counting(): Counting {
  const reads: string[] = [];
  return {
    client: {
      presence: async () => {
        reads.push("presence");
        const answer = await adminClient().presence();
        return answer;
      },
    },
    reads: () => [...reads],
  };
}

function opened(client: PresenceClient = adminClient()): Opened {
  const hand = handLive();
  const store = createBoardStore({ client, live: createLive(hand.adapter) });
  show(store);
  return { hand, store };
}

function onlineIn(
  found: ReadonlyMap<IdentityName, Presence> | readonly Presence[],
  name: IdentityName,
): boolean | null {
  const presence = [...found.values()].find((each) => each.identity === name) ?? null;
  if (presence === null) {
    return null;
  }
  return presence.online;
}

async function shown(store: BoardStore, { name, online }: Expected): Promise<Presence | null> {
  await vi.waitFor(() => {
    const held = presences(store.snapshot());

    expect(onlineIn(held, name)).toBe(online);
  });
  return presences(store.snapshot()).get(name) ?? null;
}

it("once the presence slice is read, its selector shows each identity's presence on the server", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const watching = await agentNamed("store-presence-watching-bot");
  const offline = await agentNamed("store-presence-offline-bot");
  await goOnline(watching);
  const { store } = opened();

  await expect(
    Promise.all([
      shown(store, { name: watching.name, online: true }),
      shown(store, { name: offline.name, online: false }),
    ]),
  ).resolves.toStrictEqual([
    expect.objectContaining({ identity: watching.name, online: true }),
    expect.objectContaining({ identity: offline.name, online: false }),
  ]);
});

it("a presence event changes that identity's presence, and the same event again keeps the selector's object", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("store-presence-event-bot");
  const { hand, store } = opened();
  await shown(store, { name: agent.name, online: false });

  const event = { presence: { identity: agent.name, online: true }, type: "presence" } as const;
  hand.send(event);
  const after = presences(store.snapshot());
  hand.send(event);

  expect(after.get(agent.name)).toStrictEqual(event.presence);
  expect(presences(store.snapshot())).toBe(after);
});

it("a presence event heard while the presence is being read wins over the value read", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("store-presence-during-bot");
  const during = handLive();
  const client: PresenceClient = {
    presence: async () => {
      const answer = await adminClient().presence();
      during.send({ presence: { identity: agent.name, online: true }, type: "presence" });
      return answer;
    },
  };
  const store = createBoardStore({ client, live: createLive(during.adapter) });
  show(store);

  await expect(shown(store, { name: agent.name, online: true })).resolves.toStrictEqual({
    identity: agent.name,
    online: true,
  });
});

it("presence is read only once a view shows it, and once for any number of readers", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { client, reads } = counting();
  const store = createBoardStore({ client, live: null });
  onTestFinished(store.subscribe(vi.fn<() => void>()));
  const before = reads();
  show(store);
  show(store);

  await vi.waitFor(() => {
    expect(presences(store.snapshot()).size).toBeGreaterThan(NOBODY);
  });

  expect([before, reads()]).toStrictEqual([[], ["presence"]]);
});

it("when the link comes back, presence is read again, so an identity that went offline in the gap shows offline", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("store-presence-gap-bot");
  const close = await goOnline(agent);
  const { hand, store } = opened();
  await shown(store, { name: agent.name, online: true });

  hand.report("down");
  await close();
  await vi.waitFor(async () => {
    const { presence } = await adminClient().presence();

    expect(onlineIn(presence, agent.name)).toBe(false);
  });
  hand.report("up");

  await expect(shown(store, { name: agent.name, online: false })).resolves.toMatchObject({
    identity: agent.name,
    online: false,
  });
});

it("a presence read the server refuses leaves nobody's presence known", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const refused = createCookoutClient({ env: {}, token: "cookout_not_a_token", url: webTestCookout().url });
  const answered = Promise.withResolvers<null>();
  const client: PresenceClient = {
    presence: async () => {
      try {
        const answer = await refused.presence();
        return answer;
      } finally {
        answered.resolve(null);
      }
    },
  };
  const { store } = opened(client);
  await answered.promise;

  expect(presences(store.snapshot()).size).toBe(NOBODY);
});

it("a link back while nobody shows presence reads it again only once a view shows it again", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { client, reads } = counting();
  const hand = handLive();
  const store = createBoardStore({ client, live: createLive(hand.adapter) });
  store.subscribeShowing("presence")(vi.fn<() => void>())();
  hand.report("down");
  hand.report("up");
  const whileHidden = reads();
  show(store);

  await vi.waitFor(() => {
    expect([whileHidden, reads()]).toStrictEqual([["presence"], ["presence", "presence"]]);
  });
});
