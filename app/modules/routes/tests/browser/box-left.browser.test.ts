import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inConversation, inPane, inThread, sidebarLink } from "./regions.ts";
import { logInToChannels, logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const DRAFT = "Half a thought";
const LEFT = "ArrowLeft";
const FIRST = 0;
const LAST = -1;

interface Opened {
  readonly channel: string;
  readonly thread: number;
}

async function channelOpened(page: Page, name: string): Promise<Opened> {
  const channel = unique(name);
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: "The parent." });
  await adminClient().createMessage({ channel, replyTo: message.id, text: "The reply." });
  await adminClient().createMessage({ channel, text: "The newest." });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInWithStream({ page, token, url: `/#/channels/${channel}` });

  await expect(inPane(page).getByText("The newest.", { exact: true })).toBeVisible();

  return { channel, thread: message.id };
}

function messageBox(page: Page): Locator {
  return inPane(page).getByRole("textbox", { exact: true, name: "Message" });
}

function replyBox(page: Page): Locator {
  return inThread(page).getByRole("textbox", { exact: true, name: "Reply" });
}

async function caretAtStart(box: Locator): Promise<void> {
  await box.press("Home");
}

test("← at the start of a channel's message box with text in it moves to the sidebar, keeping the text", async ({
  page,
}) => {
  const { channel } = await channelOpened(page, "browser-box-left-start");
  await messageBox(page).fill(DRAFT);
  await caretAtStart(messageBox(page));

  await page.keyboard.press(LEFT);

  await expect(sidebarLink({ label: `#${channel}`, page })).toBeFocused();
  await expect(messageBox(page)).toHaveValue(DRAFT);
});

test("← mid-text in a message box moves the caret and stays in the box", async ({ page }) => {
  await channelOpened(page, "browser-box-left-mid");
  await messageBox(page).fill(DRAFT);

  await page.keyboard.press(LEFT);
  await page.keyboard.type("|");

  await expect(messageBox(page)).toBeFocused();
  await expect(messageBox(page)).toHaveValue(`${DRAFT.slice(FIRST, LAST)}|${DRAFT.slice(LAST)}`);
});

test("← with text selected from the start of a message box moves the caret and stays in the box", async ({ page }) => {
  await channelOpened(page, "browser-box-left-selected");
  await messageBox(page).fill(DRAFT);
  await messageBox(page).selectText();

  await page.keyboard.press(LEFT);

  await expect(messageBox(page)).toBeFocused();
});

test("← in an empty message box moves to the sidebar, on the channel's link", async ({ page }) => {
  const { channel } = await channelOpened(page, "browser-box-left-empty");
  await messageBox(page).focus();

  await page.keyboard.press(LEFT);

  await expect(sidebarLink({ label: `#${channel}`, page })).toBeFocused();
});

test("← at the start of a thread's reply box moves to the thread's channel message, keeping the text", async ({
  page,
}) => {
  const { channel, thread } = await channelOpened(page, "browser-box-left-reply");
  await page.goto(`/#/channels/${channel}/threads/${String(thread)}`);
  await replyBox(page).fill(DRAFT);
  await caretAtStart(replyBox(page));

  await page.keyboard.press(LEFT);

  await expect(
    inPane(page).getByRole("feed", { exact: true, name: "Messages" }).getByRole("article").filter({
      hasText: "The parent.",
    }),
  ).toBeFocused();
  await expect(replyBox(page)).toHaveValue(DRAFT);
});

async function inboxConversationOpened(page: Page): Promise<string> {
  const channel = unique("browser-box-left-inbox");
  await adminClient().createChannel({ name: channel });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  const { message } = await adminClient().createMessage({ channel, text: "Deploy at noon?" });
  await reader.client.follow(message.id);
  const { message: reply } = await adminClient().createMessage({ channel, replyTo: message.id, text: "Rolled out." });
  const address = `#/inbox/${channel}/${String(message.id)}/messages/${String(reply.id)}`;
  await logInToChannels({ page, token: reader.token, url: `/${address}` });
  return address;
}

test("← in the Inbox's empty reply box moves to the selected row", async ({ page }) => {
  const address = await inboxConversationOpened(page);
  await inConversation(page).getByRole("textbox", { exact: true, name: "Reply" }).focus();

  await page.keyboard.press(LEFT);

  await expect(inPane(page).locator(`a[data-feed-row][href="${address}"]`)).toBeFocused();
});
