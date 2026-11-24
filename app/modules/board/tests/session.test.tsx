import type { CookoutClient, CookoutEvent, Identity, IdentityName } from "../../sdk/index.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import type { BoardStore } from "../index.ts";
import type { HandLive } from "../../testing/web.ts";
import type { LiveAdapter } from "../../live/index.ts";
import { createBoardStore } from "../index.ts";
import { createCookoutClient } from "../../sdk/index.ts";
import { createLive } from "../../live/index.ts";
import { handLive } from "../../testing/web.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

const UNREACHABLE_URL = "http://127.0.0.1:1";

interface Opened {
  readonly store: BoardStore;
  readonly hand: HandLive;
}

interface Human {
  readonly client: CookoutClient;
  readonly identity: Identity;
  readonly token: string;
}

function adminClient(): CookoutClient {
  return createCookoutClient({ env: {}, token: webTestCookout().adminToken, url: webTestCookout().url });
}

function clientWith(token: string): CookoutClient {
  return createCookoutClient({ env: {}, token, url: webTestCookout().url });
}

async function human(name: string): Promise<Human> {
  const { identity, token } = await adminClient().createIdentity({ kind: "human", name });
  return { client: clientWith(token), identity, token };
}

function opened(client: CookoutClient, shown = true): Opened {
  const hand = handLive();
  const store = createBoardStore({ client, live: createLive(hand.adapter), url: webTestCookout().url });
  onTestFinished(store.subscribeShowing("identities")(vi.fn<() => void>()));
  if (shown) {
    onTestFinished(store.session.subscribe(vi.fn<() => void>()));
  }
  return { hand, store };
}

function displayNameOf(store: BoardStore): string | null {
  const session = store.session.snapshot();
  if (session.status !== "logged-in") {
    return null;
  }
  return session.identity.displayName ?? null;
}

async function renamed(name: IdentityName, displayName: string): Promise<CookoutEvent> {
  const { identity } = await adminClient().setDisplayName(name, displayName);
  return { identity, type: "identity" };
}

interface Unreachable {
  readonly client: CookoutClient;
  readonly refused: () => boolean;
}

function unreachableAfterFirst(ada: Human): Unreachable {
  const unreachable = createCookoutClient({ env: {}, token: ada.token, url: UNREACHABLE_URL });
  let refused = false;
  const whoami = vi.fn<CookoutClient["whoami"]>(async () => {
    try {
      return await unreachable.whoami();
    } finally {
      refused = true;
    }
  });
  whoami.mockImplementationOnce(ada.client.whoami);
  return { client: { ...ada.client, whoami }, refused: () => refused };
}

async function loggedInAs(store: BoardStore, name: string): Promise<void> {
  await vi.waitFor(() => {
    expect(store.session.snapshot()).toMatchObject({ identity: { name }, status: "logged-in" });
  });
}

it("an identity event for the logged-in identity changes it, and the same event again keeps the object", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const ada = await human("store-session-event-ada");
  const { hand, store } = opened(ada.client);
  await loggedInAs(store, ada.identity.name);

  const event = await renamed(ada.identity.name, "Ada Elsewhere");
  hand.send(event);
  const after = store.session.snapshot();
  hand.send(event);

  expect([displayNameOf(store), store.session.snapshot()]).toStrictEqual(["Ada Elsewhere", after]);
  expect(store.session.snapshot()).toBe(after);
});

it("an identity event for someone else keeps the logged-in identity's object", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const ada = await human("store-session-other-ada");
  const other = await human("store-session-other-bob");
  const { hand, store } = opened(ada.client);
  await loggedInAs(store, ada.identity.name);
  const before = store.session.snapshot();

  hand.send(await renamed(other.identity.name, "Bob Elsewhere"));

  expect(store.session.snapshot()).toBe(before);
});

it("with no session cookie, the session is logged out with no refusal", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { store } = opened(createCookoutClient({ env: {}, url: webTestCookout().url }));

  await vi.waitFor(() => {
    expect(store.session.snapshot()).toStrictEqual({ refusal: null, status: "logged-out" });
  });
});

it("logging in with an agent's token is refused with human_only, and a human's token logs in", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { token } = await adminClient().createIdentity({ kind: "agent", name: "store-session-agent", owner: "admin" });
  const ada = await human("store-session-login-ada");
  const { store } = opened(createCookoutClient({ env: {}, url: webTestCookout().url }));
  store.session.logIn(token);

  await vi.waitFor(() => {
    expect(store.session.snapshot()).toMatchObject({ refusal: { code: "human_only" }, status: "logged-out" });
  });

  store.logIn(ada.token);

  await expect(loggedInAs(store, ada.identity.name)).resolves.toBeUndefined();
});

it("when the link comes back, the logged-in identity is read again, so a display name set in the gap shows", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const ada = await human("store-session-gap-ada");
  const { hand, store } = opened(ada.client);
  await loggedInAs(store, ada.identity.name);

  hand.report("down");
  await adminClient().setDisplayName(ada.identity.name, "Ada In The Gap");
  hand.report("up");

  await vi.waitFor(() => {
    expect(displayNameOf(store)).toBe("Ada In The Gap");
  });
});

it("a link back to a server that can't be reached keeps whoever is logged in", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const ada = await human("store-session-unreachable-ada");
  const { client, refused } = unreachableAfterFirst(ada);
  const { hand, store } = opened(client);
  await loggedInAs(store, ada.identity.name);

  hand.report("down");
  hand.report("up");
  await vi.waitFor(() => {
    expect(refused()).toBe(true);
  });

  expect(store.session.snapshot()).toMatchObject({ identity: { name: ada.identity.name }, status: "logged-in" });
});

it("a link back while nobody shows the session doesn't read it again", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const ada = await human("store-session-hidden-ada");
  const whoami = vi.fn<CookoutClient["whoami"]>(ada.client.whoami);
  const { hand, store } = opened({ ...ada.client, whoami }, false);
  const unsubscribe = store.subscribeShowing("session")(vi.fn<() => void>());
  await loggedInAs(store, ada.identity.name);
  unsubscribe();

  hand.report("down");
  hand.report("up");

  expect(whoami.mock.calls).toStrictEqual([[]]);
});

it("showing only the session does not open the live stream, so a page not yet logged in does not", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const open = vi.fn<LiveAdapter["open"]>();
  const store = createBoardStore({
    client: createCookoutClient({ env: {}, url: webTestCookout().url }),
    live: createLive({ open }),
    url: webTestCookout().url,
  });
  onTestFinished(store.session.subscribe(vi.fn<() => void>()));
  await vi.waitFor(() => {
    expect(store.session.snapshot().status).toBe("logged-out");
  });

  expect(open).not.toHaveBeenCalled();
});
