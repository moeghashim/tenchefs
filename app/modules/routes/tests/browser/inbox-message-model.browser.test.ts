import type { CookoutClient, Identity, MessageId } from "../../../sdk/index.ts";
import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inConversation, inPane, sidebarLink } from "./regions.ts";
import { createTestAgent } from "../../../testing/index.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const WIDE = { height: 700, width: 1280 };
const REPLY_BOX = { exact: true, name: "Reply" } as const;
const ANNOUNCEMENTS = { exact: true, name: "Announcements" } as const;
const ROW_MENU = { exact: true, name: "Inbox row actions" } as const;
const MENU_KEY = "Shift+F10";
const MOST_TABS = 40;
const NONE = 0;
const ONE = 1;
const TWO = 2;
const NOBODY = "";

interface Posted {
  readonly channel: string;
  readonly parent: MessageId;
  readonly first: MessageId;
  readonly second: MessageId;
  readonly reader: CookoutClient;
  readonly readerName: string;
  readonly token: string;
}

interface Opened extends Posted {
  readonly row: Locator;
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

async function posted(channel: string): Promise<Posted> {
  await adminClient().createChannel({ name: channel });
  const poster = await newIdentity({ kind: "agent", name: `${channel}-poster` });
  const readerName = `${channel}-reader`;
  const reader = await newIdentity({ kind: "human", name: readerName });
  const { message: parent } = await poster.client.createMessage({ channel, text: "Deploy at noon?" });
  await reader.client.follow(parent.id);
  const { message: first } = await poster.client.createMessage({ channel, replyTo: parent.id, text: "Anyone around?" });
  const { message: second } = await poster.client.createMessage({ channel, replyTo: parent.id, text: "Still here?" });
  return {
    channel,
    first: first.id,
    parent: parent.id,
    reader: reader.client,
    readerName,
    second: second.id,
    token: reader.token,
  };
}

function rowOf(page: Page, { channel, parent }: Pick<Posted, "channel" | "parent">): Locator {
  return inPane(page).locator(`a[data-feed-row][href^="#/inbox/${channel}/${String(parent)}/"]`);
}

async function openedInbox(page: Page, channel: string): Promise<Opened> {
  const thread = await posted(channel);
  await page.setViewportSize(WIDE);
  await logIn({ page, token: thread.token, url: "/#/inbox" });
  const row = rowOf(page, thread);

  await expect(row).toBeVisible();

  return { ...thread, row };
}

async function selected(page: Page, channel: string): Promise<Opened> {
  const opened = await openedInbox(page, channel);
  await page.keyboard.press("j");

  await expect(opened.row).toBeFocused();
  await expect(inConversation(page)).toContainText("Still here?");

  return opened;
}

function conversationMessage(page: Page, text: string): Locator {
  return inConversation(page).getByRole("article").filter({ hasText: text });
}

function said(page: Page, text: string): Locator {
  return page.getByRole("status", ANNOUNCEMENTS).filter({ hasText: text });
}

function unreadOf(reader: CookoutClient): () => Promise<number> {
  return async () => {
    const { items } = await reader.inbox();
    return items.length;
  };
}

async function inNewestMessage(page: Page, channel: string): Promise<Opened> {
  const opened = await selected(page, channel);
  await page.keyboard.press("ArrowRight");

  await expect(inConversation(page).getByRole("textbox", REPLY_BOX)).toBeFocused();

  await page.keyboard.press("ArrowUp");

  await expect(conversationMessage(page, "Still here?")).toBeFocused();

  return opened;
}

async function tabbedTo(page: Page, target: Locator, left = MOST_TABS): Promise<void> {
  const focused = await target.and(page.locator(":focus")).count();
  if (focused > NONE || left === NONE) {
    return;
  }
  await page.keyboard.press("Tab");
  await tabbedTo(page, target, left - ONE);
}

async function tabbedFromInbox(page: Page, target: Locator): Promise<void> {
  await sidebarLink({ label: "Inbox", page }).focus();
  await tabbedTo(page, target);

  await expect(target).toBeFocused();
}

function menuChoice(page: Page, name: string): Locator {
  return page.getByRole("menu", ROW_MENU).getByRole("menuitem", { exact: true, name });
}

async function showsKeys(
  choice: Locator,
  { keys, label }: { readonly keys: string; readonly label: string },
): Promise<void> {
  await expect(choice).toHaveAttribute("aria-keyshortcuts", keys);
  await expect(choice.locator("kbd")).toHaveText(label);
}

test("alt+Enter on an Inbox row marks it unread, the same key as on a message", async ({ page }) => {
  const { reader } = await selected(page, unique("browser-inbox-model-alt-enter"));

  await expect.poll(unreadOf(reader)).toBe(NONE);

  await page.keyboard.press("Alt+Enter");

  await expect.poll(unreadOf(reader)).toBe(TWO);
});

test("↑ from the empty reply box focuses the conversation's newest message, and Alt+Enter, L and X act on it", async ({
  page,
}) => {
  await copiesRecorded(page);
  const opened = await inNewestMessage(page, unique("browser-inbox-model-newest"));

  await page.keyboard.press("Alt+Enter");

  await expect(said(page, "Marked unread")).toBeAttached();

  await page.keyboard.press("l");

  await expect(said(page, "Link copied")).toBeAttached();
  await expect(page.locator("html")).toHaveAttribute(
    "data-copied",
    new RegExp(`/messages/${String(opened.second)}$`, "u"),
  );

  await page.keyboard.press("x");

  await expect(said(page, "Thread closed")).toBeAttached();
  await expect
    .poll(async () => {
      const thread = await opened.reader.getThread(opened.parent);
      return thread.parent.closedBy ?? NOBODY;
    })
    .toBe(opened.readerName);
});

test("k inside the Inbox's conversation moves between its messages, not between rows", async ({ page }) => {
  await inNewestMessage(page, unique("browser-inbox-model-k"));
  const address = page.url();

  await page.keyboard.press("k");

  await expect(conversationMessage(page, "Anyone around?")).toBeFocused();
  expect(page.url()).toBe(address);

  await page.keyboard.press("j");

  await expect(conversationMessage(page, "Still here?")).toBeFocused();
  expect(page.url()).toBe(address);
});

test("escape in the Inbox's reply box puts focus back on the row", async ({ page }) => {
  const { row } = await selected(page, unique("browser-inbox-model-escape"));
  await page.keyboard.press("ArrowRight");

  await expect(inConversation(page).getByRole("textbox", REPLY_BOX)).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(row).toBeFocused();
});

test("the Inbox row menu on a read row shows Mark unread's u and Alt+Enter, and Open in channel's o", async ({
  page,
}) => {
  const { reader } = await selected(page, unique("browser-inbox-model-menu-read"));

  await expect.poll(unreadOf(reader)).toBe(NONE);

  await page.keyboard.press(MENU_KEY);

  await showsKeys(menuChoice(page, "Mark unread"), { keys: "u Alt+Enter", label: "u or Alt+Enter" });
  await showsKeys(menuChoice(page, "Open in channel"), { keys: "o", label: "o" });
});

test("the Inbox row menu on an unread row shows Mark read's e", async ({ page }) => {
  const { row } = await openedInbox(page, unique("browser-inbox-model-menu-unread"));
  await row.focus();
  await page.keyboard.press(MENU_KEY);

  await showsKeys(menuChoice(page, "Mark read"), { keys: "e", label: "e" });
});

test("mark all as read works by Tab and Enter alone", async ({ page }) => {
  const { reader } = await openedInbox(page, unique("browser-inbox-model-mark-all"));
  await tabbedFromInbox(page, inPane(page).getByRole("button", { exact: true, name: "Mark all as read" }));
  await page.keyboard.press("Enter");

  await expect.poll(unreadOf(reader)).toBe(NONE);
});

async function offeredOn(page: Page, identity: Identity): Promise<void> {
  const text = `@${identity.name} has had no activity for 30 days. Deactivate it?`;
  const offer = { cleared: false, id: 1, identity, quietDays: 30, raisedAt: identity.createdAt, text };
  await page.route("**/v1/inbox", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({
      body: body.replace('"deactivationOffers":[]', `"deactivationOffers":[${JSON.stringify(offer)}]`),
      response,
    });
  });
  await page.route("**/v1/inbox/deactivation-offers/1/keep", async (route) => {
    await route.fulfill({ json: { offer: { ...offer, cleared: true } } });
  });
}

async function offerShown(page: Page, ownerName: string): Promise<void> {
  const owner = await newIdentity({ kind: "human", name: ownerName });
  const { identity } = await createTestAgent({ by: adminClient(), name: `${ownerName}/scout`, owner: ownerName });
  await offeredOn(page, identity);
  await page.setViewportSize(WIDE);
  await logIn({ page, token: owner.token, url: "/#/inbox" });
}

test("a deactivation offer's Keep works by Tab and Enter alone", async ({ page }) => {
  await offerShown(page, unique("browser-inbox-model-keep"));
  const keep = inPane(page).getByRole("button", { exact: true, name: "Keep" });

  await expect(keep).toBeVisible();

  await tabbedFromInbox(page, keep);
  const kept = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith("/v1/inbox/deactivation-offers/1/keep"),
  );
  await page.keyboard.press("Enter");
  await kept;
});

test("alt+Enter in the Inbox's reply box leaves the row read", async ({ page }) => {
  const { reader } = await selected(page, unique("browser-inbox-model-alt-enter-box"));

  await expect.poll(unreadOf(reader)).toBe(NONE);

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Alt+Enter");

  await expect(said(page, "Marked unread")).toHaveCount(NONE);
  await expect.poll(unreadOf(reader)).toBe(NONE);
});
