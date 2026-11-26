import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inThread, sidebarLink } from "./regions.ts";
import type { MessageId } from "../../../sdk/index.ts";
import type { Person } from "./people.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const FOLD = { exact: true, name: "1 closed thread" } as const;

interface Posted {
  readonly channel: string;
  readonly parent: MessageId;
  readonly reader: Person;
}

async function posted(channel: string): Promise<Posted> {
  await adminClient().createChannel({ name: channel });
  const poster = await newIdentity({ kind: "agent", name: `${channel}-poster` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await poster.client.createMessage({ channel, text: "Before." });
  const { message: parent } = await poster.client.createMessage({ channel, text: "Ship it?" });
  await poster.client.createMessage({ channel, text: "After." });
  await reader.client.follow(parent.id);
  await poster.client.createMessage({ channel, replyTo: parent.id, text: "Shipped." });
  return { channel, parent: parent.id, reader };
}

function channelFeed(page: Page): Locator {
  return inPane(page).getByRole("feed", { exact: true, name: "Messages" });
}

function channelMessage(page: Page, text: string): Locator {
  return channelFeed(page).getByRole("article").filter({ hasText: text });
}

function threadParent(page: Page): Locator {
  return inThread(page).getByRole("article", { exact: true, name: "Parent message" });
}

async function openedAt(page: Page, { channel, parent, reader }: Posted, thread: boolean): Promise<void> {
  await logInWithStream({ page, token: reader.token });
  await page.goto(`/#/channels/${channel}`);

  await expect(sidebarLink({ label: `#${channel}`, page })).toBeVisible();
  await expect(channelMessage(page, "Ship it?")).toBeVisible();

  if (thread) {
    await page.goto(`/#/channels/${channel}/threads/${String(parent)}`);
  }
}

async function focusOn(message: Locator): Promise<void> {
  await expect(message).toBeVisible();

  await message.focus();
}

async function closedFromPanel(page: Page, thread: Posted): Promise<void> {
  await openedAt(page, thread, true);
  await focusOn(threadParent(page));

  await page.keyboard.press("x");

  await expect(inThread(page).getByRole("button", { exact: true, name: "Reopen thread" })).toBeVisible();
}

test("x on a channel message whose thread has an unread reply folds it away at once, focus on the next message", async ({
  page,
}) => {
  const thread = await posted(unique("browser-close-folds-channel"));
  await openedAt(page, thread, false);
  await focusOn(channelMessage(page, "Ship it?"));

  await page.keyboard.press("x");

  await expect(channelFeed(page).getByRole("button", FOLD)).toBeVisible();
  await expect(channelMessage(page, "Ship it?")).toBeHidden();
  await expect(channelMessage(page, "After.")).toBeFocused();
});

test("x in the thread panel keeps it open, labelled Closed, and folds the thread away in the channel", async ({
  page,
}) => {
  const thread = await posted(unique("browser-close-folds-panel"));
  await closedFromPanel(page, thread);

  await expect(threadParent(page)).toContainText("Ship it?");
  await expect(channelFeed(page).getByRole("button", FOLD)).toBeVisible();
  await expect(channelMessage(page, "Ship it?")).toBeHidden();
});

test("← from a thread panel closed there lands focus on the channel message after it", async ({ page }) => {
  const thread = await posted(unique("browser-close-folds-back"));
  await closedFromPanel(page, thread);

  await expect(channelMessage(page, "Ship it?")).toBeHidden();

  await page.keyboard.press("ArrowLeft");

  await expect(channelMessage(page, "After.")).toBeFocused();
});

test("Escape from a thread panel closed there goes back to the channel, focus on the message after it", async ({
  page,
}) => {
  const thread = await posted(unique("browser-close-folds-escape"));
  await closedFromPanel(page, thread);

  await expect(channelMessage(page, "Ship it?")).toBeHidden();

  await page.keyboard.press("Escape");

  await expect(inThread(page)).toBeHidden();
  await expect(channelMessage(page, "After.")).toBeFocused();
});

test("reopening from the thread panel shows the message in the channel again", async ({ page }) => {
  const thread = await posted(unique("browser-close-folds-reopen"));
  await closedFromPanel(page, thread);

  await expect(channelMessage(page, "Ship it?")).toBeHidden();

  await page.keyboard.press("x");

  await expect(channelMessage(page, "Ship it?")).toBeVisible();
  await expect(channelFeed(page).getByRole("button", FOLD)).toBeHidden();
});

test("Close from the last channel message's menu folds it away at once, focus on the message before it", async ({
  page,
}) => {
  const thread = await posted(unique("browser-close-folds-menu"));
  await openedAt(page, thread, false);
  await focusOn(channelMessage(page, "After."));
  await page.keyboard.press("Shift+F10");

  await page.getByRole("menuitem", { exact: true, name: "Close" }).click();

  await expect(channelFeed(page).getByRole("button", FOLD)).toBeVisible();
  await expect(channelMessage(page, "Ship it?")).toBeFocused();
});
