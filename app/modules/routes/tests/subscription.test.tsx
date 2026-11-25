import { adminClient, newIdentity, sessionOf } from "./identities.ts";
import { alertSaying, alertsShown } from "./alerts.ts";
import { expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import type { CookoutClient } from "../../sdk/index.ts";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";
import { unreachableClient } from "../../testing/index.ts";

async function subscribedNames(client: CookoutClient): Promise<readonly string[]> {
  const { channels } = await client.listSubscribedChannels();
  return channels.map((channel) => channel.name);
}

interface OpenChannel {
  readonly client: CookoutClient;
  readonly close: () => void;
}

async function openChannel(channel: string): Promise<OpenChannel> {
  await adminClient().createChannel({ name: channel });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  const close = openAt({ client: reader.client, hash: `#/channels/${channel}` });
  return { client: reader.client, close };
}

async function refusedIn(channel: string): Promise<HTMLElement> {
  const toggle = await inPane().findByRole("button", { name: "Subscribe" });
  await adminClient().deleteChannel(channel);
  fireEvent.click(toggle);
  const alert = await alertSaying("Couldn't change the subscription");
  return alert;
}

function pressedOf(name: string): string | null {
  return inPane().getByRole("button", { name }).getAttribute("aria-pressed");
}

it("the channel header's toggle subscribes the logged-in human to the channel and unsubscribes them again", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { client, close } = await openChannel("web-subscribe");
  fireEvent.click(await inPane().findByRole("button", { name: "Subscribe" }));
  await inPane().findByRole("button", { name: "Subscribed" });
  const afterSubscribe = await subscribedNames(client);
  const pressed = pressedOf("Subscribed");
  fireEvent.click(inPane().getByRole("button", { name: "Subscribed" }));
  await inPane().findByRole("button", { name: "Subscribe" });

  expect([afterSubscribe, pressed, pressedOf("Subscribe"), await subscribedNames(client)]).toStrictEqual([
    ["web-subscribe"],
    "true",
    "false",
    [],
  ]);

  close();
});

it("a channel the human already subscribes to shows Subscribed, and another channel shows Subscribe", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-subscribed-already" });
  await adminClient().createChannel({ name: "web-subscribed-not" });
  const reader = await newIdentity({ kind: "human", name: "web-subscribed-reader" });
  await reader.client.subscribe("web-subscribed-already");
  const close = openAt({ client: reader.client, hash: "#/channels/web-subscribed-already" });
  await inPane().findByRole("button", { name: "Subscribed" });
  globalThis.location.hash = "#/channels/web-subscribed-not";

  await expect(inPane().findByRole("button", { name: "Subscribe" })).resolves.toHaveProperty(
    "textContent",
    "Subscribe",
  );

  close();
});

it("a subscription the server refuses says why and leaves the toggle as it was", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close } = await openChannel("web-subscribe-refused");
  const alert = await refusedIn("web-subscribe-refused");

  expect([alert.textContent, pressedOf("Subscribe")]).toStrictEqual([
    "Couldn't change the subscription (channel_not_found): There is no channel named web-subscribe-refused.",
    "false",
  ]);

  close();
});

it("a refused subscription's alert stays with its channel", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-subscribe-other" });
  const { close } = await openChannel("web-subscribe-gone");
  await refusedIn("web-subscribe-gone");
  globalThis.location.hash = "#/channels/web-subscribe-other";
  await screen.findByRole("heading", { name: "#web-subscribe-other" });

  expect(alertsShown()).toStrictEqual([]);

  close();
});

it("subscriptions that can't be loaded say why in the channel's pane", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const client = unreachableClient({ token: "cookout_any" });
  const close = openAt({ client, hash: "#/channels/web-subscriptions-unloaded", session: sessionOf(adminClient()) });

  await expect(alertSaying("Couldn't load your subscriptions")).resolves.toHaveProperty(
    "textContent",
    expect.stringMatching(/^Couldn't load your subscriptions \(unreachable\)/u),
  );

  close();
});
