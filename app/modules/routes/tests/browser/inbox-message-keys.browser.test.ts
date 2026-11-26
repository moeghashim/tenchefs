import type { CookoutClient, MessageId } from "../../../sdk/index.ts";
import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inConversation, inPane } from "./regions.ts";
import { logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const WIDE = { height: 700, width: 1280 };
const REPLY_BOX = { exact: true, name: "Reply" } as const;
const ANNOUNCEMENTS = { exact: true, name: "Announcements" } as const;
const NOBODY = "";

interface Posted {
  readonly channel: string;
  readonly parent: MessageId;
  readonly reader: CookoutClient;
  readonly readerName: string;
  readonly token: string;
}

interface Selected extends Posted {
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

function topMessage(page: Page): Locator {
  return inConversation(page).getByRole("article", { exact: true, name: "First message" });
}

function said(page: Page, text: string): Locator {
  return page.getByRole("status", ANNOUNCEMENTS).filter({ hasText: text });
}

async function posted(channel: string): Promise<Posted> {
  await adminClient().createChannel({ name: channel });
  const poster = await newIdentity({ kind: "agent", name: `${channel}-poster` });
  const readerName = `${channel}-reader`;
  const reader = await newIdentity({ kind: "human", name: readerName });
  const { message: parent } = await poster.client.createMessage({ channel, text: "Deploy at noon?" });
  await reader.client.follow(parent.id);
  await poster.client.createMessage({ channel, replyTo: parent.id, text: "Anyone around?" });
  return { channel, parent: parent.id, reader: reader.client, readerName, token: reader.token };
}

async function selectedRow(page: Page, channel: string): Promise<Selected> {
  const thread = await posted(channel);
  await logInToChannels({ page, token: thread.token });
  await page.setViewportSize(WIDE);
  await page.goto("/#/inbox");
  const row = inPane(page).locator(`a[data-feed-row][href^="#/inbox/${channel}/${String(thread.parent)}/"]`);

  await expect(row).toBeVisible();

  await page.keyboard.press("j");

  await expect(row).toBeFocused();
  await expect(topMessage(page)).toContainText("Deploy at noon?");

  return { ...thread, row };
}

function closedByOf({ parent, reader }: Selected): () => Promise<string> {
  return async () => {
    const thread = await reader.getThread(parent);
    return thread.parent.closedBy ?? NOBODY;
  };
}

test("→ on an Inbox row opens its thread with the cursor in the reply box", async ({ page }) => {
  await selectedRow(page, unique("browser-inbox-message-keys-right"));

  await page.keyboard.press("ArrowRight");

  await expect(inConversation(page).getByRole("textbox", REPLY_BOX)).toBeFocused();
});

test("t on an Inbox row opens its thread with focus on its top message", async ({ page }) => {
  await selectedRow(page, unique("browser-inbox-message-keys-top"));

  await page.keyboard.press("t");

  await expect(topMessage(page)).toBeFocused();
});

test("l on an Inbox row copies its thread's link and says so, as on a channel message", async ({ page }) => {
  await copiesRecorded(page);
  const row = await selectedRow(page, unique("browser-inbox-message-keys-link"));

  await page.keyboard.press("l");

  await expect(said(page, "Link copied")).toBeAttached();
  await expect(page.locator("html")).toHaveAttribute(
    "data-copied",
    new RegExp(`#/channels/${row.channel}/threads/${String(row.parent)}`, "u"),
  );
});

test("x on an Inbox row closes its thread and reopens it, saying so each time", async ({ page }) => {
  const row = await selectedRow(page, unique("browser-inbox-message-keys-close"));

  await page.keyboard.press("x");

  await expect(said(page, "Thread closed")).toBeAttached();
  await expect.poll(closedByOf(row)).toBe(row.readerName);

  await row.row.focus();
  await page.keyboard.press("x");

  await expect(said(page, "Thread reopened")).toBeAttached();
  await expect.poll(closedByOf(row)).toBe(NOBODY);
});

test("+ and - on an Inbox row react with 👍 and 👎 and say so, as on a channel message", async ({ page }) => {
  await selectedRow(page, unique("browser-inbox-message-keys-react"));

  await page.keyboard.press("+");

  await expect(said(page, "Reaction added")).toBeAttached();
  await expect(topMessage(page).getByRole("button", { exact: true, name: "👍 1" })).toBeVisible();

  await page.keyboard.press("-");

  await expect(topMessage(page).getByRole("button", { exact: true, name: "👎 1" })).toBeVisible();
});
