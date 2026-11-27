import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inThread, sidebarLink } from "./regions.ts";
import type { MessageId } from "../../../sdk/index.ts";
import type { Person } from "./people.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const MESSAGE_BOX = { exact: true, name: "Message" } as const;
const ANNOUNCEMENTS = { exact: true, name: "Announcements" } as const;
const ONE = 1;
const NONE = 0;
const NOBODY = "";

interface Posted {
  readonly channel: string;
  readonly parent: MessageId;
  readonly reply: MessageId;
  readonly reader: Person;
  readonly readerName: string;
}

async function posted(channel: string): Promise<Posted> {
  await adminClient().createChannel({ name: channel });
  const poster = await newIdentity({ kind: "agent", name: `${channel}-poster` });
  const readerName = `${channel}-reader`;
  const reader = await newIdentity({ kind: "human", name: readerName });
  await reader.client.subscribe(channel);
  const { message: parent } = await poster.client.createMessage({ channel, text: "The parent." });
  const { message: reply } = await poster.client.createMessage({ channel, replyTo: parent.id, text: "An answer." });
  await poster.client.createMessage({ channel, text: "Second topic." });
  await poster.client.createMessage({ channel, text: "Third topic." });
  return { channel, parent: parent.id, reader, readerName, reply: reply.id };
}

async function openedAt(page: Page, { channel, reader }: Posted, hash = `#/channels/${channel}`): Promise<void> {
  await logInWithStream({ page, token: reader.token });
  await page.goto(`/${hash}`);

  await expect(sidebarLink({ label: `#${channel}`, page })).toHaveAccessibleName(`#${channel}`);
}

function threadHash({ channel, parent }: Posted): string {
  return `#/channels/${channel}/threads/${String(parent)}`;
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

function threadReply(page: Page): Locator {
  return inThread(page).getByRole("feed", { exact: true, name: "Replies" }).getByRole("article");
}

function said(page: Page, text: string): Locator {
  return page.getByRole("status", ANNOUNCEMENTS).filter({ hasText: text });
}

async function focusOn(message: Locator): Promise<void> {
  await expect(message).toBeVisible();

  await message.focus();
}

async function copiesRecorded(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "clipboard", {
      get: (): Pick<Clipboard, "writeText"> => ({
        writeText: async (text: string): Promise<void> => {
          globalThis.document.documentElement.dataset["copied"] = text;
          await Promise.resolve();
        },
      }),
    });
  });
}

async function reportingMac(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "platform", { get: () => "MacIntel" });
  });
}

function closedByOf({ parent, reader }: Posted): () => Promise<string> {
  return async () => {
    const thread = await reader.client.getThread(parent);
    return thread.parent.closedBy ?? NOBODY;
  };
}

async function copiedLink(page: Page, link: string): Promise<string> {
  const root = page.locator("html");

  await expect(root).toHaveAttribute("data-copied", new RegExp(`${link.replaceAll("/", String.raw`\/`)}$`, "u"));

  const copied = await root.getAttribute("data-copied");
  return copied ?? "";
}

test("alt+Enter on a focused message marks it and everything after it unread, and says so", async ({ page }) => {
  const thread = await posted(unique("browser-message-action-keys-unread"));
  await openedAt(page, thread);
  await focusOn(channelMessage(page, "Second topic."));

  await page.keyboard.press("Alt+Enter");

  await expect(sidebarLink({ label: `#${thread.channel}`, page })).toHaveAccessibleName(`#${thread.channel} 2 unread`);
  await expect(said(page, "Marked unread")).toBeAttached();
});

test("l on a focused reply copies its link, which opens the thread on that reply, and says so", async ({ page }) => {
  const thread = await posted(unique("browser-message-action-keys-link"));
  await copiesRecorded(page);
  await openedAt(page, thread, threadHash(thread));
  await focusOn(threadReply(page));

  await page.keyboard.press("l");

  await expect(said(page, "Link copied")).toBeAttached();

  await page.goto(await copiedLink(page, `${threadHash(thread)}/messages/${String(thread.reply)}`));

  await expect(threadReply(page)).toHaveAttribute("aria-current", "true");
  await expect(threadReply(page)).toContainText("An answer.");
});

test("x closes an open thread from its top-level message and reopens it from a reply, saying so each time", async ({
  page,
}) => {
  const thread = await posted(unique("browser-message-action-keys-close"));
  await openedAt(page, thread, threadHash(thread));
  await focusOn(threadParent(page));

  await page.keyboard.press("x");

  await expect(said(page, "Thread closed")).toBeAttached();
  await expect.poll(closedByOf(thread)).toBe(thread.readerName);

  await focusOn(threadReply(page));
  await page.keyboard.press("x");

  await expect(said(page, "Thread reopened")).toBeAttached();
  await expect.poll(closedByOf(thread)).toBe(NOBODY);
});

test("+ on a focused message says Reaction added, and again says Reaction removed", async ({ page }) => {
  const thread = await posted(unique("browser-message-action-keys-react"));
  await openedAt(page, thread);
  await focusOn(channelMessage(page, "Third topic."));

  await page.keyboard.press("+");

  await expect(said(page, "Reaction added")).toBeAttached();
  await expect(channelMessage(page, "Third topic.").getByRole("button", { exact: true, name: "👍 1" })).toBeVisible();

  await page.keyboard.press("+");

  await expect(said(page, "Reaction removed")).toBeAttached();
  await expect(channelMessage(page, "Third topic.").getByRole("button", { exact: true, name: "👍 1" })).toBeHidden();
  await expect(page.getByRole("status", ANNOUNCEMENTS)).toHaveCount(ONE);
});

const MENU_KEYS = [
  ["Reply", "ArrowRight Enter r", "→ or Enter or r"],
  ["Open thread", "t", "t"],
  ["React with 👍", "+", "+"],
  ["React with 👎", "-", "-"],
  ["Mark unread", "Alt+Enter", "Alt+Enter"],
  ["Copy link", "l", "l"],
  ["Copy text", "c", "c"],
  ["Close", "x", "x"],
] as const;

async function menuOpenOn(page: Page): Promise<Locator> {
  await focusOn(channelMessage(page, "The parent."));
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { exact: true, name: "Message actions" });

  await expect(menu).toBeVisible();

  return menu;
}

test("the message menu has Copy link and Copy text, and every choice shows its key", async ({ page }) => {
  const thread = await posted(unique("browser-message-action-keys-menu"));
  await openedAt(page, thread);
  const menu = await menuOpenOn(page);

  await expect(menu.getByRole("menuitem")).toHaveText(MENU_KEYS.map(([name, , label]) => `${name}${label}`));

  await Promise.all(
    MENU_KEYS.map(async ([name, keys, label]) => {
      const item = menu.getByRole("menuitem", { exact: true, name });

      await expect(item).toHaveAttribute("aria-keyshortcuts", keys);
      await expect(item.locator("kbd")).toHaveText(label);
    }),
  );
});

test("on a Mac, the message menu shows Mark unread's key as ⌥Enter", async ({ page }) => {
  const thread = await posted(unique("browser-message-action-keys-mac"));
  await reportingMac(page);
  await openedAt(page, thread);
  const menu = await menuOpenOn(page);
  const markUnread = menu.getByRole("menuitem", { exact: true, name: "Mark unread" });

  await expect(markUnread).toHaveAttribute("aria-keyshortcuts", "Alt+Enter");
  await expect(markUnread.locator("kbd")).toHaveText("⌥Enter");
});

test("l and x typed in the message box type letters", async ({ page }) => {
  const thread = await posted(unique("browser-message-action-keys-typed"));
  await openedAt(page, thread);
  const box = page.getByRole("textbox", MESSAGE_BOX);
  await box.focus();

  await page.keyboard.press("l");
  await page.keyboard.press("x");

  await expect(box).toHaveValue("lx");
  await expect(said(page, "Link copied")).toHaveCount(NONE);
});
