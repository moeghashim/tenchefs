import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inThread } from "./regions.ts";
import type { MessageId } from "../../../sdk/index.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const REPLY_BOX = { exact: true, name: "Reply" } as const;

async function openedChannel(page: Page, channel: string): Promise<MessageId> {
  await adminClient().createChannel({ name: channel });
  const { message: parent } = await adminClient().createMessage({ channel, text: "The parent." });
  await adminClient().createMessage({ channel, replyTo: parent.id, text: "An answer." });
  await adminClient().createMessage({ channel, text: "Another topic." });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInWithStream({ page, token });
  await page.goto(`/#/channels/${channel}`);
  return parent.id;
}

function channelMessage(page: Page, text: string): Locator {
  return inPane(page)
    .getByRole("feed", { exact: true, name: "Messages" })
    .getByRole("article")
    .filter({ hasText: text });
}

function threadParent(page: Page): Locator {
  return inThread(page).getByRole("article", { exact: true, name: "Parent message" });
}

async function focusOn(message: Locator): Promise<void> {
  await expect(message).toBeVisible();

  await message.focus();
}

test("R on a focused message opens its thread with the cursor in the reply box, and Enter posts the reply there", async ({
  page,
}) => {
  const thread = await openedChannel(page, unique("browser-message-keys-reply"));
  await focusOn(channelMessage(page, "The parent."));

  await page.keyboard.press("r");

  const box = inThread(page).getByRole("textbox", REPLY_BOX);

  await expect(page).toHaveURL(new RegExp(`/threads/${String(thread)}$`, "u"));
  await expect(box).toBeFocused();

  await page.keyboard.type("Typed by keys.");
  await page.keyboard.press("Enter");

  await expect(inThread(page).getByRole("feed", { exact: true, name: "Replies" })).toContainText("Typed by keys.");
});

test("R on a focused reply in the thread panel puts the cursor in that thread's reply box", async ({ page }) => {
  const thread = await openedChannel(page, unique("browser-message-keys-panel-reply"));
  await page.goto(`/#/channels/${unique("browser-message-keys-panel-reply")}/threads/${String(thread)}`);
  const reply = inThread(page).getByRole("feed", { exact: true, name: "Replies" }).getByRole("article").filter({
    hasText: "An answer.",
  });
  await focusOn(reply);

  await page.keyboard.press("r");

  await expect(inThread(page).getByRole("textbox", REPLY_BOX)).toBeFocused();
});

for (const key of ["ArrowRight", "Enter"]) {
  test(`${key} on a focused message opens its thread with the cursor in the reply box`, async ({ page }) => {
    const thread = await openedChannel(page, unique(`browser-message-keys-reply-${key.toLowerCase()}`));
    await focusOn(channelMessage(page, "The parent."));

    await page.keyboard.press(key);

    await expect(page).toHaveURL(new RegExp(`/threads/${String(thread)}$`, "u"));
    await expect(inThread(page).getByRole("textbox", REPLY_BOX)).toBeFocused();
  });
}

test("t on a focused message opens its thread with focus on the thread's top-level message", async ({ page }) => {
  await openedChannel(page, unique("browser-message-keys-open-t"));
  await focusOn(channelMessage(page, "The parent."));

  await page.keyboard.press("t");

  await expect(threadParent(page)).toBeFocused();
  await expect(threadParent(page)).toContainText("The parent.");
});

test("← in the thread panel puts focus on the channel message, with the panel still open", async ({ page }) => {
  await openedChannel(page, unique("browser-message-keys-back"));
  await focusOn(channelMessage(page, "The parent."));
  await page.keyboard.press("t");

  await expect(threadParent(page)).toBeFocused();

  await page.keyboard.press("ArrowLeft");

  await expect(channelMessage(page, "The parent.")).toBeFocused();
  await expect(threadParent(page)).toBeVisible();

  await inThread(page).getByRole("feed", { exact: true, name: "Replies" }).getByRole("article").first().focus();
  await page.keyboard.press("ArrowLeft");

  await expect(channelMessage(page, "The parent.")).toBeFocused();
});

test("R typed in a text box types an r", async ({ page }) => {
  await openedChannel(page, unique("browser-message-keys-typed"));
  const box = page.getByRole("textbox", { exact: true, name: "Message" });
  await box.focus();

  await page.keyboard.press("r");

  await expect(box).toHaveValue("r");
  await expect(inThread(page)).toBeHidden();
});

test("R again on a message whose thread is open puts the cursor back in its reply box", async ({ page }) => {
  await openedChannel(page, unique("browser-message-keys-reply-again"));
  const parent = channelMessage(page, "The parent.");
  await focusOn(parent);
  await page.keyboard.press("r");

  await expect(inThread(page).getByRole("textbox", REPLY_BOX)).toBeFocused();

  await parent.focus();
  await page.keyboard.press("r");

  await expect(inThread(page).getByRole("textbox", REPLY_BOX)).toBeFocused();
});

test("T again on a message whose thread is open focuses its top-level message", async ({ page }) => {
  await openedChannel(page, unique("browser-message-keys-open-again"));
  await focusOn(channelMessage(page, "The parent."));
  await page.keyboard.press("t");

  await expect(threadParent(page)).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("t");

  await expect(threadParent(page)).toBeFocused();
});

test("the message menu's Reply and Open thread show their keys", async ({ page }) => {
  await openedChannel(page, unique("browser-message-keys-menu"));
  await focusOn(channelMessage(page, "The parent."));
  await page.keyboard.press("Shift+F10");
  const openThread = page.getByRole("menuitem", { exact: true, name: "Open thread" });

  const reply = page.getByRole("menuitem", { exact: true, name: "Reply" });

  await expect(reply).toHaveAttribute("aria-keyshortcuts", "ArrowRight Enter r");
  await expect(reply).toContainText("→ or Enter or r");
  await expect(openThread).toHaveAttribute("aria-keyshortcuts", "t");
  await expect(openThread).toContainText("t");
});
