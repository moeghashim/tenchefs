import { expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { inPane, inSidebar } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { adminClient } from "./identities.ts";
import { alertsShown } from "./alerts.ts";
import { chose } from "./menus.ts";
import { openAt } from "./render.tsx";
import { subscribedReader } from "./inbox-reader.ts";

async function channelLink(channel: string): Promise<HTMLElement> {
  const link = await inSidebar().findByRole("link", { name: new RegExp(`^#${channel}(?!-)`, "u") });
  return link;
}

async function chooseFor(channel: string, name: string): Promise<void> {
  fireEvent.contextMenu(await channelLink(channel));
  await chose(name);
}

async function shownUnread(channel: string): Promise<void> {
  await waitFor(async () => {
    const link = await channelLink(channel);

    expect(link.textContent).toBe(`#${channel} 1 unread`);
  });
}

function acksDown(reader: CookoutClient): CookoutClient {
  return {
    ...reader,
    ack: async () => {
      await Promise.resolve();
      throw new Error("down");
    },
  };
}

function failingOnce(reader: CookoutClient): CookoutClient {
  let failed = false;
  return {
    ...reader,
    ack: async (messageId) => {
      if (!failed) {
        failed = true;
        throw new Error("down");
      }
      const acked = await reader.ack(messageId);
      return acked;
    },
  };
}

async function unreadIn(channel: string): Promise<CookoutClient> {
  const { poster, reader } = await subscribedReader(channel);
  await poster.createMessage({ channel, text: "One" });
  return reader;
}

it("mark all as read that can't reach the server says why in the sidebar and leaves the channel unread", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-channel-mark-read-down";
  const close = openAt({ client: acksDown(await unreadIn(channel)), hash: "#/inbox" });
  await shownUnread(channel);
  await chooseFor(channel, "Mark all as read");
  const alert = await inSidebar().findByRole("alert");

  const link = await channelLink(channel);

  expect([alert.textContent, link.textContent]).toStrictEqual([
    `Couldn't mark #${channel} as read (unreachable): Error: down`,
    `#${channel} 1 unread`,
  ]);

  close();
});

it("a subscription change the server refuses from a channel's menu says why in the sidebar", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-channel-menu-refused";
  const { reader } = await subscribedReader(channel);
  const close = openAt({ client: reader, hash: "#/inbox" });
  await channelLink(channel);
  await adminClient().deleteChannel(channel);
  await chooseFor(channel, "Unsubscribe");

  await expect(inSidebar().findByRole("alert")).resolves.toHaveProperty(
    "textContent",
    `Couldn't change the subscription to #${channel} (channel_not_found): There is no channel named ${channel}.`,
  );

  close();
});

it("a subscription change refused from the open channel's menu is said once, beside the menu", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-channel-menu-refused-open";
  const { reader } = await subscribedReader(channel);
  const close = openAt({ client: reader, hash: `#/channels/${channel}` });
  await inPane().findByRole("button", { name: "Subscribed" });
  await adminClient().deleteChannel(channel);
  await chooseFor(channel, "Unsubscribe");
  await inSidebar().findByRole("alert");

  expect([alertsShown(), inPane().queryByRole("alert")]).toStrictEqual([
    [`Couldn't change the subscription to #${channel} (channel_not_found): There is no channel named ${channel}.`],
    null,
  ]);

  close();
});

it("a channel's next Mark all as read clears the alert of the last one", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-channel-mark-read-again";
  const close = openAt({ client: failingOnce(await unreadIn(channel)), hash: "#/inbox" });
  await shownUnread(channel);
  await chooseFor(channel, "Mark all as read");
  await inSidebar().findByRole("alert");
  await chooseFor(channel, "Mark all as read");
  await screen.findByText("You're all caught up.");

  expect(inSidebar().queryByRole("alert")).toBeNull();

  close();
});
