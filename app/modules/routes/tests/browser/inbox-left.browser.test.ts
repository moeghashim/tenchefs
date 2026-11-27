import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inConversation, inPane, sidebarLink } from "./regions.ts";
import { logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const WIDE = { height: 800, width: 1280 };
const LEFT = "ArrowLeft";
const DRAFT = "Half a thought";
const FIRST = 0;
const LAST = -1;
const NEWEST = "Rolled out, see [the runbook](https://example.com/runbook).";

interface Opened {
  readonly row: Locator;
  readonly newest: Locator;
  readonly box: Locator;
}

interface Followed {
  readonly token: string;
  readonly address: string;
}

async function threadFollowed(name: string): Promise<Followed> {
  const channel = unique(name);
  await adminClient().createChannel({ name: channel });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  const { message } = await adminClient().createMessage({ channel, text: "Deploy at noon?" });
  await reader.client.follow(message.id);
  const { message: reply } = await adminClient().createMessage({ channel, replyTo: message.id, text: NEWEST });
  return { address: `#/inbox/${channel}/${String(message.id)}/messages/${String(reply.id)}`, token: reader.token };
}

async function conversationOpened(page: Page, name: string): Promise<Opened> {
  const { address, token } = await threadFollowed(name);
  await logInToChannels({ page, token });
  await page.setViewportSize(WIDE);
  await page.goto(`/${address}`);
  const newest = inConversation(page).getByRole("article").filter({ hasText: "Rolled out, see" });

  await expect(newest).toBeVisible();

  return {
    box: inConversation(page).getByRole("textbox", { exact: true, name: "Reply" }),
    newest,
    row: inPane(page).locator(`a[data-feed-row][href="${address}"]`),
  };
}

async function typedIntoBox(page: Page, { box, row }: Opened): Promise<void> {
  await row.click();
  await page.keyboard.press("r");

  await expect(box).toBeFocused();

  await page.keyboard.type(DRAFT);
}

test("← on an Inbox row moves to the sidebar, on the Inbox's link", async ({ page }) => {
  const { row } = await conversationOpened(page, "browser-inbox-left-row");
  await row.click();

  await page.keyboard.press(LEFT);

  await expect(sidebarLink({ label: "Inbox", page })).toBeFocused();
});

test("← on a message in the Inbox's conversation moves to its row", async ({ page }) => {
  const { newest, row } = await conversationOpened(page, "browser-inbox-left-message");
  await newest.click();

  await expect(newest).toBeFocused();

  await page.keyboard.press(LEFT);

  await expect(row).toBeFocused();
});

test("← on a link in a message of the Inbox's conversation moves to its row", async ({ page }) => {
  const { newest, row } = await conversationOpened(page, "browser-inbox-left-link");
  const link = newest.getByRole("link", { exact: true, name: "the runbook" });
  await link.focus();

  await page.keyboard.press(LEFT);

  await expect(row).toBeFocused();
});

test("← in the Inbox's empty reply box moves to the newest message, and ← again to its row", async ({ page }) => {
  const opened = await conversationOpened(page, "browser-inbox-left-empty");
  await opened.row.click();
  await page.keyboard.press("r");

  await expect(opened.box).toBeFocused();

  await page.keyboard.press(LEFT);

  await expect(opened.newest).toBeFocused();

  await page.keyboard.press(LEFT);

  await expect(opened.row).toBeFocused();
});

test("← at the start of the Inbox's reply box with text in it moves to the newest message, keeping the text", async ({
  page,
}) => {
  const opened = await conversationOpened(page, "browser-inbox-left-start");
  await typedIntoBox(page, opened);
  await page.keyboard.press("Home");

  await page.keyboard.press(LEFT);

  await expect(opened.newest).toBeFocused();
  await expect(opened.box).toHaveValue(DRAFT);
});

test("← mid-text in the Inbox's reply box moves the caret and stays in the box", async ({ page }) => {
  const opened = await conversationOpened(page, "browser-inbox-left-mid");
  await typedIntoBox(page, opened);

  await page.keyboard.press(LEFT);
  await page.keyboard.type("|");

  await expect(opened.box).toBeFocused();
  await expect(opened.box).toHaveValue(`${DRAFT.slice(FIRST, LAST)}|${DRAFT.slice(LAST)}`);
});
