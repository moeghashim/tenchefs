import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const LIST = { exact: true, name: "Keyboard shortcuts" } as const;
const BOX = { exact: true, name: "Message" } as const;

async function openedChannel(page: Page, channel: string): Promise<Locator> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  await admin.createMessage({ channel, text: `Shortcut list ${channel}` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInToChannels({ page, token: reader.token });
  await page.goto(`/#/channels/${channel}`);
  const message = page.getByRole("feed", { exact: true, name: "Messages" }).getByRole("article");

  await expect(message).toBeVisible();

  return message;
}

async function followedInbox(page: Page, channel: string): Promise<void> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  const { message } = await admin.createMessage({ channel, text: `Shortcut inbox ${channel}` });
  await reader.client.follow(message.id);
  await admin.createMessage({ channel, replyTo: message.id, text: `Shortcut reply ${channel}` });
  await logInToChannels({ page, token: reader.token });
  await page.goto("/#/inbox");

  await expect(inPane(page).getByText(`Shortcut reply ${channel}`, { exact: true })).toBeVisible();
}

function rowOf({
  group,
  list,
  does,
}: {
  readonly list: Locator;
  readonly group: string;
  readonly does: string;
}): Locator {
  return list.getByRole("list", { exact: true, name: group }).getByRole("listitem").filter({ hasText: does });
}

async function reportingMac(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "platform", { get: () => "MacIntel" });
  });
}

test("? with a message focused opens the shortcut list, and Escape closes it with focus back on the message", async ({
  page,
}) => {
  const message = await openedChannel(page, unique("browser-shortcuts-open"));
  await message.focus();
  await page.keyboard.press("?");

  await expect(page.getByRole("dialog", LIST)).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog", LIST)).toBeHidden();
  await expect(message).toBeFocused();
});

test("? in the message box types a question mark, and Ctrl+/ there opens the shortcut list", async ({ page }) => {
  await openedChannel(page, unique("browser-shortcuts-box"));
  const box = page.getByRole("textbox", BOX);
  await box.click();
  await page.keyboard.press("?");

  await expect(box).toHaveValue("?");
  await expect(page.getByRole("dialog", LIST)).toBeHidden();

  await page.keyboard.press("Control+/");

  await expect(page.getByRole("dialog", LIST)).toBeVisible();
});

test("escape closes the shortcut list opened from the message box with focus back in the box", async ({ page }) => {
  await openedChannel(page, unique("browser-shortcuts-box-back"));
  const box = page.getByRole("textbox", BOX);
  await box.click();
  await page.keyboard.press("Control+/");

  await expect(page.getByRole("dialog", LIST)).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(box).toBeFocused();
});

test("the shortcut list names Ctrl+K and the Inbox keys under their groups", async ({ page }) => {
  await followedInbox(page, unique("browser-shortcuts-groups"));
  await page.keyboard.press("?");
  const list = page.getByRole("dialog", LIST);

  await expect(rowOf({ does: "Open the search box", group: "Everywhere", list })).toContainText("Ctrl+K");
  await expect(rowOf({ does: "Next row", group: "Inbox row", list })).toContainText("j");
  await expect(rowOf({ does: "Mark read", group: "Inbox row", list })).toContainText("e");
});

test("on a Mac, the shortcut list names ⌘K and opens on Cmd+/", async ({ page }) => {
  await reportingMac(page);
  await followedInbox(page, unique("browser-shortcuts-mac"));
  await page.keyboard.press("Meta+/");
  const list = page.getByRole("dialog", LIST);

  await expect(rowOf({ does: "Open the search box", group: "Everywhere", list })).toContainText("⌘K");
  await expect(rowOf({ does: "Show the keyboard shortcuts", group: "Everywhere", list })).toContainText("⌘/");
});

test("with the shortcut list open, the Inbox keys behind it do nothing", async ({ page }) => {
  await followedInbox(page, unique("browser-shortcuts-behind"));
  await page.keyboard.press("?");

  await expect(page.getByRole("dialog", LIST)).toBeVisible();

  await page.keyboard.press("j");
  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog", LIST)).toBeHidden();
  await expect(page).toHaveURL(/#\/inbox$/u);
});

test("the shortcut list names →, Enter and r for replying, and t for the top message, on a message and an Inbox row", async ({
  page,
}) => {
  await followedInbox(page, unique("browser-shortcuts-same-keys"));
  await page.keyboard.press("?");
  const list = page.getByRole("dialog", LIST);

  await Promise.all(
    ["Message", "Inbox row"].map(async (group) => {
      await expect(rowOf({ does: "Reply in its thread", group, list })).toContainText("→");
      await expect(rowOf({ does: "Reply in its thread", group, list })).toContainText("Enter");
      await expect(rowOf({ does: "Open its thread at its top message", group, list })).toContainText("t");
    }),
  );
});
