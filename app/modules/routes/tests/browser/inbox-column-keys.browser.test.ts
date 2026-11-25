import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inConversation, inPane, sidebarLink } from "./regions.ts";
import type { CookoutClient } from "../../../sdk/index.ts";
import { logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const WIDE = { height: 700, width: 1280 };
const LEFT = "ArrowLeft";
const RIGHT = "ArrowRight";
const DOWN = "ArrowDown";
const NEXT_COLUMN = "Control+]";
const PREVIOUS_COLUMN = "Control+[";
const INBOX = "Inbox";
const ONE = 1;
const REPLY_BOX = { exact: true, name: "Reply" } as const;

interface Rows {
  readonly older: string;
  readonly newer: string;
}

interface Seeding {
  readonly channel: string;
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
}

async function readThread({ channel, poster, reader }: Seeding, name: string): Promise<string> {
  const { message: parent } = await poster.createMessage({ channel, text: `Thread ${name}` });
  await reader.follow(parent.id);
  const { message: reply } = await poster.createMessage({ channel, replyTo: parent.id, text: `Reply ${name}` });
  await reader.ack(reply.id);
  return `#/inbox/${channel}/${String(parent.id)}/messages/${String(reply.id)}`;
}

async function channelsMade(channel: string): Promise<void> {
  const other = `${channel}-other`;
  await adminClient().createChannel({ name: channel });
  await adminClient().createChannel({ name: other });
  await adminClient().createMessage({ channel: other, text: "Elsewhere." });
}

async function inboxWithTwoThreads(page: Page, channel: string): Promise<Rows> {
  await channelsMade(channel);
  const poster = await newIdentity({ kind: "agent", name: `${channel}-poster` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  const seeding = { channel, poster: poster.client, reader: reader.client };
  const older = await readThread(seeding, "older");
  const newer = await readThread(seeding, "newer");
  await logInToChannels({ page, token: reader.token });
  await page.setViewportSize(WIDE);
  return { newer, older };
}

function rowAt(page: Page, address: string): Locator {
  return inPane(page).locator(`a[data-feed-row][href="${address}"]`);
}

async function opened(page: Page, { path, row }: { readonly path: string; readonly row: string }): Promise<void> {
  await page.goto(`/${path}`);

  await expect(rowAt(page, row)).toBeVisible();
}

function inboxLink(page: Page): Locator {
  return sidebarLink({ label: INBOX, page });
}

test("← on an Inbox row moves focus to the sidebar, on the Inbox's link", async ({ page }) => {
  const rows = await inboxWithTwoThreads(page, unique("browser-inbox-columns-left"));
  await opened(page, { path: "#/inbox", row: rows.newer });
  await rowAt(page, rows.older).focus();
  await page.keyboard.press(LEFT);

  await expect(inboxLink(page)).toBeFocused();
});

test("→ on the Inbox's sidebar link moves focus to the newest row", async ({ page }) => {
  const rows = await inboxWithTwoThreads(page, unique("browser-inbox-columns-right"));
  await opened(page, { path: "#/inbox", row: rows.newer });
  await inboxLink(page).focus();
  await page.keyboard.press(RIGHT);

  await expect(rowAt(page, rows.newer)).toBeFocused();
});

test("→ on the Inbox's sidebar link moves focus to the selected row, when one is", async ({ page }) => {
  const rows = await inboxWithTwoThreads(page, unique("browser-inbox-columns-selected"));
  await opened(page, { path: rows.older, row: rows.older });
  await inboxLink(page).focus();
  await page.keyboard.press(RIGHT);

  await expect(rowAt(page, rows.older)).toBeFocused();
});

test("→ on the Inbox's sidebar link from a channel opens the Inbox, on its newest row", async ({ page }) => {
  const channel = unique("browser-inbox-columns-from");
  const rows = await inboxWithTwoThreads(page, channel);
  await page.goto(`/#/channels/${channel}-other`);

  await expect(inPane(page).getByText("Elsewhere.", { exact: true })).toBeVisible();

  await inboxLink(page).focus();
  await page.keyboard.press(RIGHT);

  await expect(page).toHaveURL(/#\/inbox$/u);
  await expect(rowAt(page, rows.newer)).toBeFocused();
});

test("↓ on the newest message of the Inbox's conversation moves focus into its reply box", async ({ page }) => {
  const rows = await inboxWithTwoThreads(page, unique("browser-inbox-columns-down"));
  await opened(page, { path: rows.newer, row: rows.newer });
  const newest = inConversation(page).getByRole("article").filter({ hasText: "Reply newer" });
  await newest.focus();
  await page.keyboard.press(DOWN);

  await expect(inConversation(page).getByRole("textbox", REPLY_BOX)).toBeFocused();
});

function focusInConversation(page: Page): Locator {
  return inConversation(page).locator(":focus");
}

test("Ctrl+] from the Inbox's link moves to the selected row, then the conversation, then back to the sidebar", async ({
  page,
}) => {
  const rows = await inboxWithTwoThreads(page, unique("browser-inbox-columns-next"));
  await opened(page, { path: rows.older, row: rows.older });
  await inboxLink(page).focus();
  await page.keyboard.press(NEXT_COLUMN);

  await expect(rowAt(page, rows.older)).toBeFocused();

  await page.keyboard.press(NEXT_COLUMN);

  await expect(focusInConversation(page)).toHaveCount(ONE);

  await page.keyboard.press(NEXT_COLUMN);

  await expect(inboxLink(page)).toBeFocused();
});

test("Ctrl+[ from the Inbox's link moves to the conversation, then the selected row", async ({ page }) => {
  const rows = await inboxWithTwoThreads(page, unique("browser-inbox-columns-previous"));
  await opened(page, { path: rows.older, row: rows.older });
  await inboxLink(page).focus();
  await page.keyboard.press(PREVIOUS_COLUMN);

  await expect(focusInConversation(page)).toHaveCount(ONE);

  await page.keyboard.press(PREVIOUS_COLUMN);

  await expect(rowAt(page, rows.older)).toBeFocused();
});
