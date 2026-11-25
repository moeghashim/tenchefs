import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inThread, sidebarLink } from "./regions.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const NEXT = "Control+]";
const PREVIOUS = "Control+[";
const DRAFT = "Half a thought";
const ONE = 1;

interface Opening {
  readonly page: Page;
  readonly channel: string;
  readonly thread: boolean;
}

function messageSaying(page: Page, text: string): Locator {
  return inPane(page)
    .getByRole("feed", { exact: true, name: "Messages" })
    .getByRole("article")
    .filter({ hasText: text });
}

async function seeded(channel: string): Promise<number> {
  await adminClient().createChannel({ name: channel });
  await adminClient().createMessage({ channel, text: "The oldest." });
  const { message } = await adminClient().createMessage({ channel, text: "The newest." });
  await adminClient().createMessage({ channel, replyTo: message.id, text: "The reply." });
  return message.id;
}

async function opened({ channel, page, thread }: Opening): Promise<void> {
  const parent = await seeded(channel);
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await reader.client.subscribe(channel);
  await logInWithStream({ page, token: reader.token });
  if (thread) {
    await page.goto(`/#/channels/${channel}/threads/${String(parent)}`);

    await expect(inThread(page).getByText("The reply.", { exact: true })).toBeVisible();
  } else {
    await page.goto(`/#/channels/${channel}`);
  }

  await expect(messageSaying(page, "The newest.")).toBeVisible();
}

function messageBox(page: Page): Locator {
  return inPane(page).getByRole("textbox", { exact: true, name: "Message" });
}

function threadReply(page: Page): Locator {
  return inThread(page).getByRole("article").filter({ hasText: "The reply." });
}

async function intoMessages(page: Page, row: Locator): Promise<void> {
  await row.focus();
  await page.keyboard.press(NEXT);

  await expect(inPane(page).getByRole("feed", { exact: true, name: "Messages" }).locator("article:focus")).toHaveCount(
    ONE,
  );
}

async function crossedForward(page: Page, row: Locator): Promise<void> {
  await intoMessages(page, row);
  await messageSaying(page, "The oldest.").focus();
  await page.keyboard.press(NEXT);

  await expect(inThread(page).locator(":focus")).toHaveCount(ONE);

  await threadReply(page).focus();
  await page.keyboard.press(NEXT);

  await expect(row).toBeFocused();
}

async function backToThread(page: Page): Promise<void> {
  await page.keyboard.press(PREVIOUS);

  await expect(threadReply(page)).toBeFocused();
}

test("ctrl+] cycles the three columns (the sidebar, the messages and the thread panel), and ctrl+[ goes back, each region returning focus where it was left", async ({
  page,
}) => {
  const channel = unique("browser-regions-cycle");
  await opened({ channel, page, thread: true });
  const row = sidebarLink({ label: `#${channel}`, page });
  await crossedForward(page, row);
  await backToThread(page);
  await page.keyboard.press(PREVIOUS);

  await expect(messageSaying(page, "The oldest.")).toBeFocused();

  await page.keyboard.press(PREVIOUS);

  await expect(row).toBeFocused();
});

test("ctrl+] skips the thread panel when none is open, and the message box is no stop", async ({ page }) => {
  const channel = unique("browser-regions-skip");
  await opened({ channel, page, thread: false });
  const row = sidebarLink({ label: `#${channel}`, page });
  await messageSaying(page, "The oldest.").focus();
  await page.keyboard.press(NEXT);

  await expect(row).toBeFocused();

  await page.keyboard.press(PREVIOUS);

  await expect(messageSaying(page, "The oldest.")).toBeFocused();
});

test("from inside the message box, ctrl+] and ctrl+[ move to the columns either side, keeping the draft", async ({
  page,
}) => {
  const channel = unique("browser-regions-box");
  await opened({ channel, page, thread: true });
  const row = sidebarLink({ label: `#${channel}`, page });
  await messageBox(page).fill(DRAFT);
  await page.keyboard.press(NEXT);

  await expect(inThread(page).locator(":focus")).toHaveCount(ONE);

  await messageBox(page).focus();
  await page.keyboard.press(PREVIOUS);

  await expect(row).toBeFocused();
  await expect(messageBox(page)).toHaveValue(DRAFT);
});

test("on a Mac, Control+] moves to the next region and Meta+] isn't bound", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "platform", { get: () => "MacIntel" });
  });
  const channel = unique("browser-regions-mac");
  await opened({ channel, page, thread: false });
  await messageSaying(page, "The oldest.").focus();
  await page.keyboard.press("Meta+]");

  await expect(messageSaying(page, "The oldest.")).toBeFocused();

  await page.keyboard.press(NEXT);

  await expect(sidebarLink({ label: `#${channel}`, page })).toBeFocused();
});
