import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inConversation, inPane, inProfile } from "./regions.ts";
import type { Page } from "@playwright/test";
import { logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const BOX = { exact: true, name: "Search" } as const;
const REPLY = { exact: true, name: "Reply" } as const;

async function openedOnThread(page: Page, channel: string): Promise<string> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const { message } = await admin.createMessage({ channel, text: `Keymap thread ${channel}` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInToChannels({ page, token: reader.token });
  await page.goto(`/#/channels/${channel}/threads/${String(message.id)}`);
  return `${channel}-reader`;
}

async function followedThread(channel: string): Promise<string> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  const { message } = await admin.createMessage({ channel, text: `Keymap inbox ${channel}` });
  await reader.client.follow(message.id);
  await admin.createMessage({ channel, replyTo: message.id, text: `Keymap reply ${channel}` });
  return reader.token;
}

async function inboxRowSelected(page: Page, channel: string): Promise<string> {
  await logInToChannels({ page, token: await followedThread(channel) });
  await page.goto("/#/inbox");

  await expect(inPane(page).getByText(`Keymap reply ${channel}`, { exact: true })).toBeVisible();

  await page.keyboard.press("j");

  await expect(page).toHaveURL(/#\/inbox\/.+/u);

  return page.url();
}

async function reportingMac(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "platform", { get: () => "MacIntel" });
  });
}

test("ctrl+K opens the search box from the reply box, and Escape gives focus back to the reply box", async ({
  page,
}) => {
  await openedOnThread(page, unique("browser-keymap-ctrl-k"));
  const reply = page.getByRole("textbox", REPLY);
  await reply.click();
  await page.keyboard.press("Control+k");

  await expect(page.getByRole("combobox", BOX)).toBeFocused();
  await expect(page.getByRole("combobox", BOX)).toHaveAttribute("placeholder", "Go to or search (Ctrl+K)");

  await page.keyboard.press("Escape");

  await expect(reply).toBeFocused();
});

test("on a Mac, Cmd+K opens the search box and its placeholder names ⌘K", async ({ page }) => {
  await reportingMac(page);
  await openedOnThread(page, unique("browser-keymap-mac"));
  await page.getByRole("textbox", REPLY).click();
  await page.keyboard.press("Meta+k");

  await expect(page.getByRole("combobox", BOX)).toBeFocused();
  await expect(page.getByRole("combobox", BOX)).toHaveAttribute("placeholder", "Go to or search (⌘K)");
  await expect(page.getByRole("combobox", BOX)).toHaveAttribute("aria-keyshortcuts", "Meta+K");
});

test("on a Mac, Ctrl+K in the reply box leaves the search box closed", async ({ page }) => {
  await reportingMac(page);
  await openedOnThread(page, unique("browser-keymap-mac-ctrl"));
  const reply = page.getByRole("textbox", REPLY);
  await reply.click();
  await page.keyboard.press("Control+k");
  await page.keyboard.type("still here");

  await expect(reply).toBeFocused();
  await expect(reply).toHaveValue("still here");
});

test("off a Mac, Cmd+K leaves the search box closed", async ({ page }) => {
  await openedOnThread(page, unique("browser-keymap-other-meta"));
  const reply = page.getByRole("textbox", REPLY);
  await reply.click();
  await page.keyboard.press("Meta+k");
  await page.keyboard.type("still here");

  await expect(reply).toBeFocused();
});

test("escape closes the profile panel", async ({ page }) => {
  const reader = await openedOnThread(page, unique("browser-keymap-profile"));
  await page.goto(`/#/people/${reader}`);

  await expect(inProfile(page)).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(inProfile(page)).toBeHidden();
  await expect(page).toHaveURL(/#\/people$/u);
});

test("single-letter keys typed in the reply box type their letters and trigger nothing", async ({ page }) => {
  const selected = await inboxRowSelected(page, unique("browser-keymap-letters"));
  const reply = inConversation(page).getByRole("textbox", REPLY);
  await reply.click();
  await page.keyboard.type("jkeuor");

  await expect(reply).toHaveValue("jkeuor");
  await expect(reply).toBeFocused();
  await expect(inConversation(page).getByRole("button", { exact: true, name: "Mark unread" })).toBeVisible();

  expect(page.url()).toBe(selected);
});
