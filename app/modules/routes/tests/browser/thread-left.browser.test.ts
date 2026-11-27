import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inThread } from "./regions.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const LEFT = "ArrowLeft";
const DRAFT = "Half a thought";

async function channelOpened(page: Page, name: string): Promise<void> {
  const channel = unique(name);
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: "The parent." });
  await adminClient().createMessage({ channel, replyTo: message.id, text: "The reply." });
  await adminClient().createMessage({ channel, text: "The newest." });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInWithStream({ page, token, url: `/#/channels/${channel}` });

  await expect(inPane(page).getByText("The newest.", { exact: true })).toBeVisible();
}

function channelMessage(page: Page): Locator {
  return inPane(page)
    .getByRole("feed", { exact: true, name: "Messages" })
    .getByRole("article")
    .filter({ hasText: "The parent." });
}

function replyBox(page: Page): Locator {
  return inThread(page).getByRole("textbox", { exact: true, name: "Reply" });
}

function threadReply(page: Page): Locator {
  return inThread(page).getByRole("feed", { exact: true, name: "Replies" }).getByRole("article").filter({
    hasText: "The reply.",
  });
}

async function openedByT(page: Page): Promise<void> {
  await channelMessage(page).focus();
  await page.keyboard.press("t");

  await expect(inThread(page).getByRole("article", { exact: true, name: "Parent message" })).toBeFocused();
}

async function openedByReplyCount(page: Page): Promise<void> {
  await channelMessage(page).getByText("1 reply", { exact: true }).click();

  await expect(threadReply(page)).toBeVisible();
}

async function openedByReplyLink(page: Page): Promise<void> {
  const message = channelMessage(page);
  const reply = message.getByRole("group", { exact: true, name: "Quick actions" }).getByRole("link", {
    exact: true,
    name: "Reply",
  });

  await expect(async () => {
    await message.hover();

    await expect(reply).toBeVisible({ timeout: 1000 });
  }).toPass();

  await reply.click();

  await expect(replyBox(page)).toBeFocused();
}

async function wentBackToChannel(page: Page): Promise<void> {
  await page.keyboard.press(LEFT);

  await expect(channelMessage(page)).toBeFocused();
  await expect(channelMessage(page)).toHaveAttribute("aria-current", "true");
}

test("← on the thread's top message goes to the thread's message in the channel", async ({ page }) => {
  await channelOpened(page, "browser-thread-left-top");
  await openedByT(page);

  await wentBackToChannel(page);
});

test("← on a reply in the thread panel goes to the thread's message in the channel", async ({ page }) => {
  await channelOpened(page, "browser-thread-left-reply");
  await openedByT(page);
  await threadReply(page).focus();

  await wentBackToChannel(page);
});

test("← on the author link of a reply in the thread panel goes to the thread's message in the channel", async ({
  page,
}) => {
  await channelOpened(page, "browser-thread-left-author");
  await openedByT(page);
  await threadReply(page).getByRole("link", { exact: true, name: "admin" }).focus();

  await wentBackToChannel(page);
});

test("← in the thread's empty reply box goes to the thread's message in the channel", async ({ page }) => {
  await channelOpened(page, "browser-thread-left-empty-box");
  await openedByT(page);
  await replyBox(page).focus();

  await wentBackToChannel(page);
});

test("← at the first character of a draft in the thread's reply box goes to the channel, keeping the draft", async ({
  page,
}) => {
  await channelOpened(page, "browser-thread-left-draft");
  await openedByT(page);
  await replyBox(page).fill(DRAFT);
  await replyBox(page).press("Home");

  await wentBackToChannel(page);

  await expect(replyBox(page)).toHaveValue(DRAFT);
});

test("← straight after opening a thread by its reply count goes to the thread's message in the channel", async ({
  page,
}) => {
  await channelOpened(page, "browser-thread-left-count");
  await openedByReplyCount(page);

  await wentBackToChannel(page);
});

test("← at the first character of the mention opening a thread by its Reply link puts there goes to the channel, keeping the mention", async ({
  page,
}) => {
  await channelOpened(page, "browser-thread-left-link");
  await openedByReplyLink(page);

  await expect(replyBox(page)).toHaveValue("@admin ");

  await replyBox(page).press("Home");
  await wentBackToChannel(page);

  await expect(replyBox(page)).toHaveValue("@admin ");
});

const PAST_A_PAGE = 60;

async function oldThreadOpened(page: Page, name: string): Promise<void> {
  const channel = unique(name);
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: "The parent." });
  await adminClient().createMessage({ channel, replyTo: message.id, text: "The reply." });
  await Promise.all(
    [...Array.from({ length: PAST_A_PAGE }).keys()].map(async (made) => {
      await adminClient().createMessage({ channel, text: `Later topic ${String(made)}.` });
    }),
  );
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInWithStream({ page, token, url: `/#/channels/${channel}/threads/${String(message.id)}` });

  await expect(threadReply(page)).toBeVisible();
  await expect(channelMessage(page)).not.toBeAttached();
}

test("← in the reply box of a thread older than the channel's loaded messages loads them back to its message", async ({
  page,
}) => {
  await oldThreadOpened(page, "browser-thread-left-old-box");
  await replyBox(page).focus();

  await wentBackToChannel(page);
});

test("← on a reply of a thread older than the channel's loaded messages loads them back to its message", async ({
  page,
}) => {
  await oldThreadOpened(page, "browser-thread-left-old-reply");
  await threadReply(page).focus();

  await wentBackToChannel(page);
});
