import type { CookoutClient, Identity, IdentityName } from "../../sdk/index.ts";
import { createBoardStore, deletedIdentities, identityList, presences } from "../index.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import type { BoardStore } from "../index.ts";
import type { HandLive } from "../../testing/web.ts";
import { createCookoutClient } from "../../sdk/index.ts";
import { createLive } from "../../live/index.ts";
import { handLive } from "../../testing/web.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

const NEVER = 0;
const ONCE = 1;

interface Opened {
  readonly store: BoardStore;
  readonly hand: HandLive;
}

interface Seen {
  readonly identity: Identity | null;
  readonly online: boolean | null;
  readonly deleted: readonly IdentityName[];
}

function adminClient(): CookoutClient {
  return createCookoutClient({ env: {}, token: webTestCookout().adminToken, url: webTestCookout().url });
}

async function agentNamed(name: string): Promise<Identity> {
  const { identity } = await adminClient().createIdentity({ kind: "agent", name, owner: "admin" });
  return identity;
}

async function displayNamed(name: IdentityName, displayName: string): Promise<Identity> {
  const { identity } = await adminClient().setDisplayName(name, displayName);
  return identity;
}

function show(store: BoardStore, shown: "identities" | "presence"): void {
  onTestFinished(store.subscribeShowing(shown)(vi.fn<() => void>()));
}

function opened(client: CookoutClient = adminClient()): Opened {
  const hand = handLive();
  const store = createBoardStore({ client, live: createLive(hand.adapter), url: webTestCookout().url });
  show(store, "identities");
  return { hand, store };
}

function heldAs(store: BoardStore, name: IdentityName): Identity | null {
  return identityList(store.snapshot()).find((identity) => identity.name === name) ?? null;
}

function onlineOf(store: BoardStore, name: IdentityName): boolean | null {
  const presence = presences(store.snapshot()).get(name) ?? null;
  if (presence === null) {
    return null;
  }
  return presence.online;
}

function seen(store: BoardStore, name: IdentityName): Seen {
  return {
    deleted: [...deletedIdentities(store.snapshot())],
    identity: heldAs(store, name),
    online: onlineOf(store, name),
  };
}

async function listed(store: BoardStore, name: IdentityName): Promise<Identity | null> {
  await vi.waitFor(() => {
    expect(heldAs(store, name)).not.toBeNull();
  });
  return heldAs(store, name);
}

async function listedWith(store: BoardStore, identity: Identity): Promise<void> {
  await vi.waitFor(() => {
    expect(heldAs(store, identity.name)).toStrictEqual(identity);
  });
}

it("once the identities slice is read, its selector lists every identity, deactivated ones too, by name", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const quiet = await agentNamed("store-identities-quiet-bot");
  const { identity } = await adminClient().deactivateIdentity(quiet.name);
  const { store } = opened();
  await listedWith(store, identity);
  const names = identityList(store.snapshot()).map((each) => each.name);

  expect(names).toStrictEqual(names.toSorted());
});

it("an identity event changes that identity in the selectors, and the same event again keeps the selector's object", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("store-identities-event-bot");
  const { hand, store } = opened();
  await listed(store, agent.name);
  const identity = await displayNamed(agent.name, "Event Bot");
  hand.send({ identity, type: "identity" });
  const after = identityList(store.snapshot());
  hand.send({ identity, type: "identity" });

  expect(heldAs(store, agent.name)).toStrictEqual(identity);
  expect(identityList(store.snapshot())).toBe(after);
});

it("an identity-deleted event removes the identity from the identities and presence selectors", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("store-identities-deleted-bot");
  const { hand, store } = opened();
  show(store, "presence");
  await vi.waitFor(() => {
    expect(seen(store, agent.name)).toStrictEqual({ deleted: [], identity: agent, online: false });
  });
  hand.send({ identity: agent, type: "identity-deleted" });
  const after = store.snapshot();
  hand.send({ identity: agent, type: "identity-deleted" });

  expect(seen(store, agent.name)).toStrictEqual({ deleted: [agent.name], identity: null, online: null });
  expect(store.snapshot()).toBe(after);
});

it("an identity made again after being deleted is no longer among the deleted identities", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("store-identities-again-bot");
  const { hand, store } = opened();
  await listed(store, agent.name);
  hand.send({ identity: agent, type: "identity-deleted" });
  hand.send({ identity: agent, type: "identity" });

  expect(seen(store, agent.name)).toMatchObject({ deleted: [], identity: agent });
});

it("an identity event heard while the identities are being read wins over the value read", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("store-identities-during-bot");
  const during = handLive();
  const client: CookoutClient = {
    ...adminClient(),
    listIdentities: async (options) => {
      const answer = await adminClient().listIdentities(options);
      during.send({ identity: await displayNamed(agent.name, "Heard Meanwhile"), type: "identity" });
      return answer;
    },
  };
  const store = createBoardStore({ client, live: createLive(during.adapter), url: webTestCookout().url });
  show(store, "identities");

  await expect(listed(store, agent.name)).resolves.toMatchObject({ displayName: "Heard Meanwhile" });
});

it("when the link comes back, the identities are read again, so a display name set in the gap shows", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("store-identities-gap-bot");
  const { hand, store } = opened();
  await listed(store, agent.name);
  hand.report("down");
  const identity = await displayNamed(agent.name, "Gap Bot");
  hand.report("up");

  await expect(listedWith(store, identity)).resolves.toBeUndefined();
});

it("identities are read only once a view shows them, and once for any number of readers", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const listIdentities = vi.fn<CookoutClient["listIdentities"]>(async (options) => {
    const answer = await adminClient().listIdentities(options);
    return answer;
  });
  const store = createBoardStore({
    client: { ...adminClient(), listIdentities },
    live: null,
    url: webTestCookout().url,
  });
  onTestFinished(store.subscribe(vi.fn<() => void>()));
  const before = listIdentities.mock.calls.length;
  show(store, "identities");
  show(store, "identities");

  await vi.waitFor(() => {
    expect([before, listIdentities.mock.calls.length]).toStrictEqual([NEVER, ONCE]);
  });
});

it("an identity call puts the server's answer in the identities selector at once", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("store-identities-call-bot");
  const { store } = opened();
  await listed(store, agent.name);
  await store.identityCalls.setDisplayName(agent.name, "Called Bot");

  expect(heldAs(store, agent.name)).toMatchObject({ displayName: "Called Bot" });
});
