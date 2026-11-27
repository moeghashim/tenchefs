import type { Channel, CookoutClient } from "../../sdk/index.ts";
import { channelList, createBoardStore, subscribedChannels, webhookCommandList } from "../index.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import type { BoardStore } from "../index.ts";
import type { HandLive } from "../../testing/web.ts";
import { createCookoutClient } from "../../sdk/index.ts";
import { createLive } from "../../live/index.ts";
import { handLive } from "../../testing/web.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

interface Opened {
  readonly store: BoardStore;
  readonly hand: HandLive;
}

function adminClient(): CookoutClient {
  return createCookoutClient({ env: {}, token: webTestCookout().adminToken, url: webTestCookout().url });
}

function refusedClient(): CookoutClient {
  return createCookoutClient({ env: {}, token: "cookout_not_a_token", url: webTestCookout().url });
}

function opened(client: CookoutClient = adminClient()): Opened {
  const hand = handLive();
  const store = createBoardStore({ client, live: createLive(hand.adapter), url: webTestCookout().url });
  for (const shown of ["channels", "webhookCommands", "subscriptions"] as const) {
    onTestFinished(store.subscribeShowing(shown)(vi.fn<() => void>()));
  }
  return { hand, store };
}

function channelNames(store: BoardStore): readonly string[] {
  const state = channelList(store.snapshot());
  if (state.status !== "loaded") {
    return [];
  }
  return state.channels.map((channel) => channel.name);
}

function subscribedNames(store: BoardStore): readonly string[] {
  const state = subscribedChannels(store.snapshot());
  if (state.status !== "loaded") {
    return [];
  }
  return state.channels;
}

function webhookCommandNames(store: BoardStore): readonly string[] {
  const state = webhookCommandList(store.snapshot());
  if (state.status !== "loaded") {
    return [];
  }
  return state.webhookCommands.map((command) => command.name);
}

function changeOf(store: BoardStore): { readonly channel: string; readonly status: string } | null {
  const state = subscribedChannels(store.snapshot());
  if (state.status !== "loaded" || state.change.status !== "failed") {
    return null;
  }
  return { channel: state.change.channel, status: state.change.status };
}

async function created(name: string): Promise<Channel> {
  const { channel } = await adminClient().createChannel({ name });
  return channel;
}

async function createdByBob(name: string): Promise<Channel> {
  const { token } = await adminClient().createIdentity({ kind: "human", name: `${name}-bob` });
  const bob = createCookoutClient({ env: {}, token, url: webTestCookout().url });
  const { channel } = await bob.createChannel({ name: `${name}-bobs` });
  return channel;
}

async function readsAll(store: BoardStore, channel: string): Promise<void> {
  await vi.waitFor(() => {
    expect([channelNames(store), subscribedNames(store), webhookCommandList(store.snapshot()).status]).toStrictEqual([
      expect.arrayContaining([channel]),
      expect.arrayContaining([channel]),
      "loaded",
    ]);
  });
}

it("a channel-deleted event removes the channel from the channel list and from the subscriptions", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = await created("store-channels-deleted");
  const { hand, store } = opened();
  await readsAll(store, channel.name);
  hand.send({ channel, type: "channel-deleted" });

  expect([channelNames(store), subscribedNames(store)]).toStrictEqual([
    expect.not.arrayContaining([channel.name]),
    expect.not.arrayContaining([channel.name]),
  ]);
});

it("a channel event adds the channel once, and the same event again keeps the selector's object", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const known = await created("store-channels-known");
  const { hand, store } = opened();
  await readsAll(store, known.name);
  const channel = await created("store-channels-heard");
  hand.send({ channel, type: "channel" });
  const after = channelList(store.snapshot());
  hand.send({ channel, type: "channel" });

  expect(channelNames(store).filter((name) => name === channel.name)).toStrictEqual([channel.name]);
  expect(channelList(store.snapshot())).toBe(after);
});

it("a `command` event adds the Webhook command once, and the same event again keeps the selector's object", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const known = await created("store-channels-command");
  const { hand, store } = opened();
  await readsAll(store, known.name);
  const { command } = await adminClient().addCommand({
    name: "store-heard-deploy",
    schema: { type: "object" },
    url: "http://127.0.0.1:9/",
  });
  hand.send({ command, type: "command" });
  const after = webhookCommandList(store.snapshot());
  hand.send({ command, type: "command" });

  expect(webhookCommandNames(store).filter((name) => name === command.name)).toStrictEqual([command.name]);
  expect(webhookCommandList(store.snapshot())).toBe(after);
});

it("a Webhook command or a subscription changed while the link was down shows once the link is back", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const known = await created("store-channels-gap");
  const bobs = await createdByBob("store-channels-gap");
  const { hand, store } = opened();
  await readsAll(store, known.name);
  hand.report("down");
  await adminClient().addCommand({ name: "store-gap-deploy", schema: { type: "object" }, url: "http://127.0.0.1:9/" });
  await adminClient().subscribe(bobs.name);
  hand.report("up");

  await vi.waitFor(() => {
    expect([webhookCommandNames(store), subscribedNames(store)]).toStrictEqual([
      expect.arrayContaining(["store-gap-deploy"]),
      expect.arrayContaining([bobs.name]),
    ]);
  });
});

it("a subscription event changes the subscriptions, and subscribing through the store keeps a refusal", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = await created("store-channels-subscribe");
  const { hand, store } = opened({ ...adminClient(), unsubscribe: refusedClient().unsubscribe });
  await readsAll(store, channel.name);
  hand.send({ subscription: { channel: channel.name, subscribed: false }, type: "subscription" });
  const heard = subscribedNames(store).includes(channel.name);
  store.calls.setSubscribed(channel.name, false, "channel-header");

  await vi.waitFor(() => {
    expect([heard, changeOf(store)]).toStrictEqual([false, { channel: channel.name, status: "failed" }]);
  });
});

it("a channel created through the store joins the channel list and the subscriptions", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const known = await created("store-channels-before-create");
  const { store } = opened();
  await readsAll(store, known.name);
  const channel = await store.calls.createChannel({ name: "store-channels-create" });

  expect([channelNames(store), subscribedNames(store)]).toStrictEqual([
    expect.arrayContaining([channel.name]),
    expect.arrayContaining([channel.name]),
  ]);
});

it("a channel list the server refuses shows the refusal", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { store } = opened(refusedClient());

  await vi.waitFor(() => {
    expect(
      [channelList, webhookCommandList, subscribedChannels].map((select) => select(store.snapshot())),
    ).toStrictEqual([
      expect.objectContaining({ code: "token_unknown", status: "failed" }),
      expect.objectContaining({ code: "token_unknown", status: "failed" }),
      expect.objectContaining({ code: "token_unknown", status: "failed" }),
    ]);
  });
});
