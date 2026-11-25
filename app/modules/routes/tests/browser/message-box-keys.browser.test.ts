import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inThread } from "./regions.ts";
import type { MessageId } from "../../../sdk/index.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const DRAFT = "Half a thought";

async function openedAt(page: Page, channel: string, path: string): Promise<void> {
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInWithStream({ page, token });
  await page.goto(`/#/channels/${channel}${path}`);
}

async function channelOpened(page: Page, channel: string): Promise<void> {
  await adminClient().createChannel({ name: channel });
  await adminClient().createMessage({ channel, text: "The oldest." });
  await adminClient().createMessage({ channel, text: "The middle." });
  await adminClient().createMessage({ channel, text: "The newest." });
  await openedAt(page, channel, "");
}

async function typedInto(box: Locator): Promise<void> {
  await box.focus();
  await box.fill(DRAFT);
}

function messageSaying(page: Page, text: string): Locator {
  return inPane(page)
    .getByRole("feed", { exact: true, name: "Messages" })
    .getByRole("article")
    .filter({ hasText: text });
}

function messageBox(page: Page): Locator {
  return inPane(page).getByRole("textbox", { exact: true, name: "Message" });
}

function focusedMessage(page: Page): Locator {
  return page.locator("article:focus");
}

test("↑ in an empty message box focuses the newest message, and with the caret after the first character it doesn't", async ({
  page,
}) => {
  const channel = unique("browser-box-up");
  await channelOpened(page, channel);
  await messageBox(page).focus();

  await page.keyboard.press("ArrowUp");

  await expect(focusedMessage(page)).toContainText("The newest.");

  await messageBox(page).fill(DRAFT);
  await page.keyboard.press("ArrowUp");

  await expect(messageBox(page)).toBeFocused();
});

test("Escape in the message box keeps the draft and returns focus to the message focused before", async ({ page }) => {
  const channel = unique("browser-box-escape");
  await channelOpened(page, channel);
  await messageSaying(page, "The middle.").focus();
  await typedInto(messageBox(page));

  await page.keyboard.press("Escape");

  await expect(focusedMessage(page)).toContainText("The middle.");
  await expect(messageBox(page)).toHaveValue(DRAFT);
});

async function threadOf(channel: string): Promise<MessageId> {
  await adminClient().createChannel({ name: channel });
  const { message: parent } = await adminClient().createMessage({ channel, text: "The parent." });
  await adminClient().createMessage({ channel, replyTo: parent.id, text: "The first reply." });
  await adminClient().createMessage({ channel, replyTo: parent.id, text: "The last reply." });
  return parent.id;
}

test("Escape in a thread's reply box keeps the draft and returns focus to where it was", async ({ page }) => {
  const channel = unique("browser-box-thread-escape");
  const parent = await threadOf(channel);
  await openedAt(page, channel, `/threads/${String(parent)}`);
  const replies = inThread(page).getByRole("feed", { exact: true, name: "Replies" });
  await replies.getByRole("article").filter({ hasText: "The first reply." }).focus();
  const replyBox = inThread(page).getByRole("textbox", { exact: true, name: "Reply" });
  await typedInto(replyBox);

  await page.keyboard.press("Escape");

  await expect(focusedMessage(page)).toContainText("The first reply.");
  await expect(replyBox).toHaveValue(DRAFT);
});

interface Pressing {
  readonly page: Page;
  readonly key: string;
  readonly chip: Locator;
}

async function pressAndSee({ chip, key, page }: Pressing): Promise<void> {
  await page.keyboard.press(key);

  await expect(chip).toBeVisible();
}

test("+ and - on a focused message toggle its 👍 and 👎", async ({ page }) => {
  const channel = unique("browser-box-react");
  await channelOpened(page, channel);
  const message = messageSaying(page, "The middle.");
  await message.focus();
  const thumbsUp = message.getByRole("button", { exact: true, name: "👍 1", pressed: true });

  await pressAndSee({ chip: thumbsUp, key: "Shift+Equal", page });
  await pressAndSee({
    chip: message.getByRole("button", { exact: true, name: "👎 1", pressed: true }),
    key: "Minus",
    page,
  });
  await page.keyboard.press("Shift+Equal");

  await expect(thumbsUp).toBeHidden();
  await expect(focusedMessage(page)).toContainText("The middle.");
});
