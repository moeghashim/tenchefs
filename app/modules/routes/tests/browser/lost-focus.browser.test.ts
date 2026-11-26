import type { CookoutClient, MessageId } from "../../../sdk/index.ts";
import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inConversation, inPane, inThread, sidebarLink } from "./regions.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const DOWN = "ArrowDown";
const NONE = 0;
const REPLY_BOX = { exact: true, name: "Reply" } as const;

interface Seeded {
  readonly after: string;
  readonly channel: string;
  readonly gone: string;
  readonly parent: MessageId;
  readonly token: string;
}

async function channelWithAThread(channel: string): Promise<MessageId> {
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: "The oldest." });
  await adminClient().createMessage({ channel, text: "The middle." });
  await adminClient().createMessage({ channel, text: "The newest." });
  await adminClient().createMessage({ channel, replyTo: message.id, text: "The first reply." });
  await adminClient().createMessage({ channel, replyTo: message.id, text: "The last reply." });
  return message.id;
}

async function subscribedChannel(reader: CookoutClient, name: string): Promise<void> {
  await adminClient().createChannel({ name });
  await reader.subscribe(name);
}

async function seeded(name: string): Promise<Seeded> {
  const channel = unique(name);
  const gone = `${channel}-gone`;
  const after = `${gone}-z`;
  const parent = await channelWithAThread(channel);
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await reader.client.subscribe(channel);
  await subscribedChannel(reader.client, gone);
  await subscribedChannel(reader.client, after);
  return { after, channel, gone, parent, token: reader.token };
}

function messageSaying(page: Page, text: string): Locator {
  return inPane(page)
    .getByRole("feed", { exact: true, name: "Messages" })
    .getByRole("article")
    .filter({ hasText: text });
}

function replySaying(page: Page, text: string): Locator {
  return inThread(page).getByRole("article").filter({ hasText: text });
}

async function openedChannel(page: Page, name: string): Promise<Seeded> {
  const opened = await seeded(name);
  await logInWithStream({ page, token: opened.token, url: `/#/channels/${opened.channel}` });

  await expect(messageSaying(page, "The newest.")).toBeVisible();
  await expect(sidebarLink({ label: `#${opened.after}`, page })).toBeVisible();

  return opened;
}

async function focusOnBody(page: Page): Promise<void> {
  await page.evaluate(() => {
    const { activeElement } = document;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  });

  await expect(page.locator("body")).toBeFocused();
}

async function openedThreadOfTheOldest(page: Page): Promise<void> {
  await messageSaying(page, "The oldest.").focus();
  await page.keyboard.press("Enter");

  await expect(replySaying(page, "The last reply.")).toBeVisible();
}

async function closedPanelLeavesFocusOnTheOldest(page: Page): Promise<void> {
  await expect(inThread(page)).toBeHidden();
  await expect(messageSaying(page, "The oldest.")).toBeFocused();
}

test("a key on the page body lands focus, and a thread panel going from under its focus leaves it on the channel's message", async ({
  page,
}) => {
  await openedChannel(page, "browser-lost-keys");

  await test.step("↓ with focus on the page body focuses the channel's newest message, and moves nothing", async () => {
    await expect(page.locator("body")).toBeFocused();

    await page.keyboard.press(DOWN);

    await expect(messageSaying(page, "The newest.")).toBeFocused();
  });

  await test.step("a key on the page body lands focus back on what last had focus, while it is still on the page", async () => {
    await messageSaying(page, "The oldest.").focus();
    await focusOnBody(page);
    await page.keyboard.press("j");

    await expect(messageSaying(page, "The oldest.")).toBeFocused();
  });

  await test.step("thread panel: when the thread panel goes from under its focused reply, focus lands on the channel's message", async () => {
    await openedThreadOfTheOldest(page);
    await replySaying(page, "The first reply.").focus();
    await page.goBack();

    await closedPanelLeavesFocusOnTheOldest(page);
  });

  await test.step("message box: when the focused reply box goes with its thread panel, focus lands on the channel's message", async () => {
    await openedThreadOfTheOldest(page);
    await inThread(page).getByRole("textbox", REPLY_BOX).focus();
    await page.goBack();

    await closedPanelLeavesFocusOnTheOldest(page);
  });

  await test.step("closing a thread with its X from the thread panel leaves focus on the channel message", async () => {
    await openedThreadOfTheOldest(page);
    await replySaying(page, "The first reply.").focus();
    await inThread(page).getByRole("link", { exact: true, name: "Close panel" }).click();

    await closedPanelLeavesFocusOnTheOldest(page);
  });
});

test("when the focused message or channel link goes, focus moves to its neighbour", async ({ page }) => {
  const opened = await openedChannel(page, "browser-lost-gone");

  await test.step("message list: when the focused message folds away, focus moves to the next message", async () => {
    await messageSaying(page, "The oldest.").focus();
    await adminClient().closeThread(opened.parent);

    await expect(messageSaying(page, "The oldest.")).toBeHidden();
    await expect(messageSaying(page, "The middle.")).toBeFocused();
  });

  await test.step("message list: when the newest message folds away, focus moves to the previous one", async () => {
    const { message } = await adminClient().createMessage({ channel: opened.channel, text: "Fold me." });

    await expect(messageSaying(page, "Fold me.")).toBeVisible();

    await messageSaying(page, "Fold me.").focus();
    await adminClient().closeThread(message.id);

    await expect(messageSaying(page, "Fold me.")).toBeHidden();
    await expect(messageSaying(page, "The newest.")).toBeFocused();
  });

  await test.step("sidebar: when the focused channel link goes, focus moves to the next link", async () => {
    await sidebarLink({ label: `#${opened.gone}`, page }).focus();
    await adminClient().deleteChannel(opened.gone);

    await expect(sidebarLink({ label: `#${opened.gone}`, page })).toBeHidden();
    await expect(sidebarLink({ label: `#${opened.after}`, page })).toBeFocused();
  });
});

test("↓ with focus on the page body and a thread open focuses the thread panel's newest message", async ({ page }) => {
  const opened = await seeded("browser-lost-thread");
  await logInWithStream({
    page,
    token: opened.token,
    url: `/#/channels/${opened.channel}/threads/${String(opened.parent)}`,
  });

  await expect(replySaying(page, "The last reply.")).toBeVisible();

  await sidebarLink({ label: `#${opened.gone}`, page }).focus();
  await focusOnBody(page);
  await adminClient().deleteChannel(opened.gone);

  await expect(sidebarLink({ label: `#${opened.gone}`, page })).toBeHidden();
  await expect(page.locator("body")).toBeFocused();

  await page.keyboard.press(DOWN);

  await expect(replySaying(page, "The last reply.")).toBeFocused();
});

interface Following {
  readonly channel: string;
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
}

async function followedThreads(following: Following, texts: readonly string[]): Promise<void> {
  if (texts.length === NONE) {
    return;
  }
  const [text = "", ...rest] = texts;
  const { channel, poster, reader } = following;
  const { message } = await poster.createMessage({ channel, text: `${text} thread` });
  await reader.follow(message.id);
  await poster.createMessage({ channel, replyTo: message.id, text: `${text} reply` });
  await followedThreads(following, rest);
}

async function openedInbox(page: Page, name: string): Promise<void> {
  const channel = unique(name);
  await adminClient().createChannel({ name: channel });
  const poster = await newIdentity({ kind: "agent", name: `${channel}-poster` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await followedThreads({ channel, poster: poster.client, reader: reader.client }, ["First", "Second", "Third"]);
  await logInWithStream({ page, token: reader.token, url: "/#/inbox" });

  await expect(inPane(page).getByText("First reply", { exact: true })).toBeVisible();
}

function rowSaying(page: Page, text: string): Locator {
  return inPane(page).getByRole("listitem").filter({ hasText: text }).locator("a[data-feed-row]");
}

test("Inbox rows: marking the focused row read moves focus to the next row", async ({ page }) => {
  await openedInbox(page, "browser-lost-inbox-read");
  await page.keyboard.press("j");

  await expect(inConversation(page)).toContainText("Third thread");
  await expect(rowSaying(page, "Third reply")).toBeFocused();

  await page.keyboard.press("e");

  await expect(rowSaying(page, "Second reply")).toBeFocused();
  await expect(inConversation(page)).toContainText("Second thread");
});
