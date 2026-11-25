import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inThread, sidebarLink } from "./regions.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const LEFT = "ArrowLeft";
const RIGHT = "ArrowRight";
const DOWN = "ArrowDown";
const DRAFT = "abcd";
const TWO_LEFT = 2;
const ONE_LEFT = 3;
const REPLY_BOX = { exact: true, name: "Reply" } as const;
const MESSAGE_BOX = { exact: true, name: "Message" } as const;

interface Opening {
  readonly page: Page;
  readonly channel: string;
  readonly thread: boolean;
  readonly also: readonly string[];
}

async function seeded(channel: string): Promise<number> {
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: "The oldest." });
  await adminClient().createMessage({ channel, text: "The newest." });
  await adminClient().createMessage({ channel, replyTo: message.id, text: "The first reply." });
  await adminClient().createMessage({ channel, replyTo: message.id, text: "The last reply." });
  return message.id;
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

function messageBox(page: Page): Locator {
  return inPane(page).getByRole("textbox", MESSAGE_BOX);
}

async function readerOf(channels: readonly string[]): Promise<string> {
  const reader = await newIdentity({ kind: "human", name: unique("browser-columns-reader") });
  await Promise.all(
    channels.map(async (channel) => {
      await reader.client.subscribe(channel);
    }),
  );
  return reader.token;
}

async function opened({ also, channel, page, thread }: Opening): Promise<void> {
  const parent = await seeded(channel);
  await Promise.all(
    also.map(async (each) => {
      await seeded(each);
    }),
  );
  await logInWithStream({ page, token: await readerOf([channel, ...also]) });
  if (thread) {
    await page.goto(`/#/channels/${channel}/threads/${String(parent)}`);

    await expect(replySaying(page, "The last reply.")).toBeVisible();
  } else {
    await page.goto(`/#/channels/${channel}`);
  }

  await expect(messageSaying(page, "The newest.")).toBeVisible();
}

async function caretMoved(page: Page, box: Locator): Promise<void> {
  await box.focus();
  await box.fill(DRAFT);
  await page.keyboard.press(LEFT);
  await page.keyboard.press(LEFT);

  await expect(box).toBeFocused();
  await expect(box).toHaveJSProperty("selectionStart", TWO_LEFT);

  await page.keyboard.press(RIGHT);

  await expect(box).toBeFocused();
  await expect(box).toHaveJSProperty("selectionStart", ONE_LEFT);
}

test("← on a channel message moves focus to the sidebar, on that channel's link", async ({ page }) => {
  const channel = unique("browser-columns-left");
  await opened({ also: [], channel, page, thread: false });
  await messageSaying(page, "The oldest.").focus();
  await page.keyboard.press(LEFT);

  await expect(sidebarLink({ label: `#${channel}`, page })).toBeFocused();
});

test("→ on the open channel's sidebar link moves focus to its newest message", async ({ page }) => {
  const channel = unique("browser-columns-right");
  await opened({ also: [], channel, page, thread: false });
  await sidebarLink({ label: `#${channel}`, page }).focus();
  await page.keyboard.press(RIGHT);

  await expect(messageSaying(page, "The newest.")).toBeFocused();
});

test("→ on the open channel's sidebar link moves focus to the selected message, when one is", async ({ page }) => {
  const channel = unique("browser-columns-selected");
  await opened({ also: [], channel, page, thread: true });
  await sidebarLink({ label: `#${channel}`, page }).focus();
  await page.keyboard.press(RIGHT);

  await expect(messageSaying(page, "The oldest.")).toBeFocused();
});

test("→ on another channel's sidebar link opens it and moves focus to its newest message", async ({ page }) => {
  const channel = unique("browser-columns-other");
  const other = unique("browser-columns-next");
  await opened({ also: [other], channel, page, thread: false });
  await sidebarLink({ label: `#${other}`, page }).focus();
  await page.keyboard.press(RIGHT);

  await expect(page).toHaveURL(new RegExp(`#/channels/${other}$`, "u"));
  await expect(messageSaying(page, "The newest.")).toBeFocused();
});

test("↓ on the newest channel message moves focus into the message box", async ({ page }) => {
  const channel = unique("browser-columns-down");
  await opened({ also: [], channel, page, thread: false });
  await messageSaying(page, "The oldest.").focus();
  await page.keyboard.press(DOWN);

  await expect(messageSaying(page, "The newest.")).toBeFocused();

  await page.keyboard.press(DOWN);

  await expect(messageBox(page)).toBeFocused();
});

test("↓ on the newest message in the thread moves focus into the reply box", async ({ page }) => {
  const channel = unique("browser-columns-down-thread");
  await opened({ also: [], channel, page, thread: true });
  await replySaying(page, "The last reply.").focus();
  await page.keyboard.press(DOWN);

  await expect(inThread(page).getByRole("textbox", REPLY_BOX)).toBeFocused();
});

test("← and → move the cursor in the message box and the reply box, and focus stays", async ({ page }) => {
  const channel = unique("browser-columns-caret");
  await opened({ also: [], channel, page, thread: true });
  await caretMoved(page, messageBox(page));
  await caretMoved(page, inThread(page).getByRole("textbox", REPLY_BOX));
});
