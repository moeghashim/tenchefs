import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inConversation, inPane } from "./regions.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const UP = "ArrowUp";
const DRAFT = "Half a thought";
const START = 0;
const THIRD = 3;
const NONE = 0;
const ONE = 1;
const WIDE = { height: 700, width: 1280 };
const NEWEST = "The newest.";

interface Column {
  readonly box: Locator;
  readonly newest: Locator;
}

async function loggedIn(page: Page, reader: string): Promise<void> {
  const { token } = await newIdentity({ kind: "human", name: reader });
  await logInWithStream({ page, token });
}

async function channelColumn(page: Page): Promise<Column> {
  const channel = unique("browser-first-character-channel");
  await adminClient().createChannel({ name: channel });
  await adminClient().createMessage({ channel, text: "The oldest." });
  await adminClient().createMessage({ channel, text: NEWEST });
  await loggedIn(page, `${channel}-reader`);
  await page.goto(`/#/channels/${channel}`);
  const feed = inPane(page).getByRole("feed", { exact: true, name: "Messages" });
  const newest = feed.getByRole("article").filter({ hasText: NEWEST });

  await expect(newest).toBeVisible();

  return { box: inPane(page).getByRole("textbox", { exact: true, name: "Message" }), newest };
}

async function followedThread(channel: string): Promise<{ readonly token: string; readonly address: string }> {
  await adminClient().createChannel({ name: channel });
  const poster = await newIdentity({ kind: "agent", name: `${channel}-poster` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  const { message: parent } = await poster.client.createMessage({ channel, text: "The thread." });
  await reader.client.follow(parent.id);
  const { message: reply } = await poster.client.createMessage({ channel, replyTo: parent.id, text: NEWEST });
  return { address: `#/inbox/${channel}/${String(parent.id)}/messages/${String(reply.id)}`, token: reader.token };
}

async function inboxColumn(page: Page): Promise<Column> {
  const { address, token } = await followedThread(unique("browser-first-character-inbox"));
  await logInWithStream({ page, token });
  await page.setViewportSize(WIDE);
  await page.goto(`/${address}`);
  const newest = inConversation(page).getByRole("article").filter({ hasText: NEWEST });

  await expect(newest).toBeVisible();

  return { box: inConversation(page).getByRole("textbox", { exact: true, name: "Reply" }), newest };
}

async function pressedTimes(page: Page, key: string, times: number): Promise<void> {
  if (times === NONE) {
    return;
  }
  await page.keyboard.press(key);
  await pressedTimes(page, key, times - ONE);
}

interface Placing {
  readonly page: Page;
  readonly box: Locator;
  readonly key: string;
  readonly times: number;
}

async function draftedThen({ box, key, page, times }: Placing): Promise<void> {
  await box.focus();
  await box.fill(DRAFT);
  await page.keyboard.press("Home");
  await pressedTimes(page, key, times);
}

async function upFromFirstCharacter(page: Page, { box, newest }: Column): Promise<void> {
  await draftedThen({ box, key: "ArrowRight", page, times: START });
  await page.keyboard.press(UP);

  await expect(newest).toBeFocused();
  await expect(box).toHaveValue(DRAFT);
}

async function upFromThirdCharacter(page: Page, { box }: Column): Promise<void> {
  await draftedThen({ box, key: "ArrowRight", page, times: THIRD });

  await expect(box).toHaveJSProperty("selectionStart", THIRD);

  await page.keyboard.press(UP);

  await expect(box).toBeFocused();
  await expect(box).toHaveJSProperty("selectionStart", START);
  await expect(box).toHaveValue(DRAFT);
}

test("↑ at the first character of a channel's message box, with text in it, focuses the newest message and keeps the draft", async ({
  page,
}) => {
  await upFromFirstCharacter(page, await channelColumn(page));
});

test("↑ at the third character of a channel's message box moves the caret, and focus stays", async ({ page }) => {
  await upFromThirdCharacter(page, await channelColumn(page));
});

test("↑ at the first character of the Inbox's reply box, with text in it, focuses the newest message and keeps the draft", async ({
  page,
}) => {
  await upFromFirstCharacter(page, await inboxColumn(page));
});

test("↑ at the third character of the Inbox's reply box moves the caret, and focus stays", async ({ page }) => {
  await upFromThirdCharacter(page, await inboxColumn(page));
});

test("↑ with the first characters selected in a channel's message box keeps focus in the box", async ({ page }) => {
  const { box } = await channelColumn(page);
  await draftedThen({ box, key: "Shift+ArrowRight", page, times: THIRD });
  await page.keyboard.press(UP);

  await expect(box).toBeFocused();
});
