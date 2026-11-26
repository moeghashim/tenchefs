import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inThread } from "./regions.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const UP = "ArrowUp";
const DOWN = "ArrowDown";
const TOP = "t";
const REPLY_BOX = { exact: true, name: "Reply" } as const;

interface Opening {
  readonly page: Page;
  readonly channel: string;
  readonly replied: boolean;
}

function topMessage(page: Page): Locator {
  return inThread(page).getByRole("article", { exact: true, name: "Parent message" });
}

async function opened({ channel, page, replied }: Opening): Promise<void> {
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: "The top message." });
  if (replied) {
    await adminClient().createMessage({ channel, replyTo: message.id, text: "The first reply." });
    await adminClient().createMessage({ channel, replyTo: message.id, text: "The last reply." });
  }
  const { token } = await newIdentity({ kind: "human", name: unique("browser-top-reader") });
  await logInWithStream({ page, token });
  await page.goto(`/#/channels/${channel}/threads/${String(message.id)}`);

  await expect(topMessage(page)).toBeVisible();
}

function replySaying(page: Page, text: string): Locator {
  return inThread(page)
    .getByRole("feed", { exact: true, name: "Replies" })
    .getByRole("article")
    .filter({ hasText: text });
}

async function onTop(page: Page): Promise<void> {
  const first = replySaying(page, "The first reply.");
  await first.focus();
  await page.keyboard.press(UP);

  await expect(topMessage(page)).toBeFocused();
}

test("↑ on the first reply moves focus to the thread's top message, and ↓ goes back to the first reply", async ({
  page,
}) => {
  await opened({ channel: unique("browser-top-up"), page, replied: true });
  await onTop(page);
  await page.keyboard.press(DOWN);

  await expect(replySaying(page, "The first reply.")).toBeFocused();
});

test("↓ on a top message with no replies moves focus into the reply box", async ({ page }) => {
  await opened({ channel: unique("browser-top-alone"), page, replied: false });
  await topMessage(page).focus();
  await page.keyboard.press(DOWN);

  await expect(inThread(page).getByRole("textbox", REPLY_BOX)).toBeFocused();
});

test("r, + and - work on the top message reached by ↑", async ({ page }) => {
  await opened({ channel: unique("browser-top-keys"), page, replied: true });
  await onTop(page);
  await page.keyboard.press("+");

  await expect(topMessage(page).getByRole("button", { exact: true, name: "👍 1", pressed: true })).toBeVisible();

  await page.keyboard.press("-");

  await expect(topMessage(page).getByRole("button", { exact: true, name: "👎 1", pressed: true })).toBeVisible();

  await page.keyboard.press("r");

  await expect(inThread(page).getByRole("textbox", REPLY_BOX)).toBeFocused();
});

test("the actions menu opens from the keyboard on the top message reached by ↑", async ({ page }) => {
  await opened({ channel: unique("browser-top-menu"), page, replied: true });
  await onTop(page);
  await page.keyboard.press("Shift+F10");

  await expect(page.getByRole("menu", { exact: true, name: "Message actions" })).toBeVisible();
});

function channelMessage(page: Page, text: string): Locator {
  return inPane(page)
    .getByRole("feed", { exact: true, name: "Messages" })
    .getByRole("article")
    .filter({ hasText: text });
}

async function enteredByT(page: Page): Promise<void> {
  const channel = unique("browser-top-enter");
  await opened({ channel, page, replied: true });
  await page.goto(`/#/channels/${channel}`);
  const top = channelMessage(page, "The top message.");

  await expect(top).toBeVisible();

  await top.focus();
  await page.keyboard.press(TOP);

  await expect(topMessage(page)).toBeFocused();
}

test("t then ↓ focuses the first reply, and k on it focuses the top message again", async ({ page }) => {
  await enteredByT(page);
  await page.keyboard.press(DOWN);

  await expect(replySaying(page, "The first reply.")).toBeFocused();

  await page.keyboard.press("k");

  await expect(topMessage(page)).toBeFocused();
});

test("j on the top message focuses the first reply", async ({ page }) => {
  await enteredByT(page);
  await page.keyboard.press("j");

  await expect(replySaying(page, "The first reply.")).toBeFocused();
});

test("Home and End in the thread panel focus the top message and the newest reply", async ({ page }) => {
  await enteredByT(page);
  await page.keyboard.press("End");

  await expect(replySaying(page, "The last reply.")).toBeFocused();

  await page.keyboard.press("Home");

  await expect(topMessage(page)).toBeFocused();
});
