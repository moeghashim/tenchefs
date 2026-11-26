import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inConversation, inPane, inThread } from "./regions.ts";
import { logInToChannels, logInWithStream } from "./login.ts";
import type { CookoutClient } from "../../../sdk/index.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const NARROW = { height: 900, width: 600 };
const NONE = 0;
const ONE = 1;
const MORE_THAN_A_PAGE = 55;

function channelFeed(page: Page): Locator {
  return inPane(page).getByRole("feed", { exact: true, name: "Messages" });
}

function channelMessage(page: Page, text: string): Locator {
  return channelFeed(page).getByRole("article").filter({ hasText: text });
}

async function openedFromChannel(page: Page, channel: string): Promise<void> {
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: "The parent." });
  await adminClient().createMessage({ channel, replyTo: message.id, text: "The reply." });
  await adminClient().createMessage({ channel, text: "The next topic." });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInWithStream({ page, token, url: `/#/channels/${channel}` });
  await channelMessage(page, "The parent.").focus();
  await page.keyboard.press("t");
}

test("Escape closing a thread opened from a channel message puts focus back on it, and j carries on from there", async ({
  page,
}) => {
  await openedFromChannel(page, unique("browser-thread-close-focus-channel"));
  await inThread(page).getByText("The reply.", { exact: true }).click();
  await page.keyboard.press("Escape");

  await expect(inThread(page)).toBeHidden();
  await expect(channelMessage(page, "The parent.")).toBeFocused();

  await page.keyboard.press("j");

  await expect(channelMessage(page, "The next topic.")).toBeFocused();
});

interface Posting {
  readonly channel: string;
  readonly left: number;
}

async function postedLater({ channel, left }: Posting): Promise<void> {
  if (left === NONE) {
    return;
  }
  await adminClient().createMessage({ channel, text: `Later ${String(left)}.` });
  await postedLater({ channel, left: left - ONE });
}

async function openedPastThePage(page: Page, channel: string): Promise<void> {
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: "The old parent." });
  await adminClient().createMessage({ channel, replyTo: message.id, text: "The old reply." });
  await postedLater({ channel, left: MORE_THAN_A_PAGE });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInWithStream({ page, token, url: `/#/channels/${channel}/threads/${String(message.id)}` });
}

test("Escape closing a thread whose channel message isn't loaded puts focus on the channel's newest message", async ({
  page,
}) => {
  await openedPastThePage(page, unique("browser-thread-close-focus-gone"));
  await inThread(page).getByText("The old reply.", { exact: true }).click();

  await expect(channelMessage(page, "The old parent.")).toHaveCount(NONE);

  await page.keyboard.press("Escape");

  await expect(inThread(page)).toBeHidden();
  await expect(channelMessage(page, "Later 1.")).toBeFocused();
});

interface Following {
  readonly channel: string;
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
}

async function followedThread({ channel, poster, reader }: Following, text: string): Promise<string> {
  const { message } = await poster.createMessage({ channel, text });
  await reader.follow(message.id);
  const { message: reply } = await poster.createMessage({ channel, replyTo: message.id, text: `${text} reply` });
  return `#/inbox/${channel}/${String(message.id)}/messages/${String(reply.id)}`;
}

interface Reader {
  readonly newer: string;
  readonly older: string;
  readonly token: string;
}

async function followedThreads(channel: string): Promise<Reader> {
  await adminClient().createChannel({ name: channel });
  const poster = await newIdentity({ kind: "agent", name: `${channel}-poster` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  const following = { channel, poster: poster.client, reader: reader.client };
  const older = await followedThread(following, "Older thread");
  const newer = await followedThread(following, "Newer thread");
  return { newer, older, token: reader.token };
}

function rowAt(page: Page, address: string): Locator {
  return inPane(page).locator(`a[data-feed-row][href="${address}"]`);
}

async function narrowConversation(page: Page, channel: string): Promise<Reader> {
  const reader = await followedThreads(channel);
  await logInToChannels({ page, token: reader.token });
  await page.setViewportSize(NARROW);
  await page.goto(`/${reader.newer}`);

  await expect(inConversation(page)).toContainText("Newer thread reply");

  return reader;
}

test("at 600 px wide, Escape from a conversation puts focus back on its row, and j carries on from there", async ({
  page,
}) => {
  const { newer, older } = await narrowConversation(page, unique("browser-thread-close-focus-inbox"));
  await inConversation(page).getByRole("article").filter({ hasText: "Newer thread reply" }).focus();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("heading", { exact: true, level: 1, name: "Inbox" })).toBeVisible();
  await expect(rowAt(page, newer)).toBeFocused();

  await page.keyboard.press("j");

  await expect(page).toHaveURL(new RegExp(`${older.replaceAll("/", String.raw`\/`)}$`, "u"));
  await expect(inConversation(page)).toContainText("Older thread reply");
});
