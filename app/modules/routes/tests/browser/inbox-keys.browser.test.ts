import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { inConversation, inPane } from "./regions.ts";
import type { CookoutClient } from "../../../sdk/index.ts";
import type { Page } from "@playwright/test";
import { logInToChannels } from "./login.ts";

const NARROW = { height: 900, width: 600 };
const WIDE = { height: 700, width: 1280 };
const MANY = 30;
const PRESSES = 25;
const NONE = 0;
const ONE = 1;

interface Reader {
  readonly reader: CookoutClient;
  readonly poster: CookoutClient;
  readonly token: string;
}

async function readerOf(channel: string): Promise<Reader> {
  await adminClient().createChannel({ name: channel });
  const poster = await newIdentity({ kind: "agent", name: `${channel}-poster` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  return { poster: poster.client, reader: reader.client, token: reader.token };
}

interface Posting extends Reader {
  readonly channel: string;
}

async function readThreads(posting: Posting, count: number): Promise<readonly string[]> {
  if (count === NONE) {
    return [];
  }
  const { channel, poster, reader } = posting;
  const { message: parent } = await poster.createMessage({ channel, text: `Thread ${String(count)}` });
  await reader.follow(parent.id);
  const { message: reply } = await poster.createMessage({
    channel,
    replyTo: parent.id,
    text: `Reply ${String(count)}`,
  });
  await reader.ack(reply.id);
  const newer = await readThreads(posting, count - ONE);
  return [...newer, `#/inbox/${channel}/${String(parent.id)}/messages/${String(reply.id)}`];
}

interface Opening {
  readonly page: Page;
  readonly channel: string;
  readonly count: number;
  readonly size: Readonly<typeof WIDE>;
}

async function openedWithReadThreads({ channel, count, page, size }: Opening): Promise<readonly string[]> {
  const reader = await readerOf(channel);
  const addresses = await readThreads({ ...reader, channel }, count);
  await logInToChannels({ page, token: reader.token });
  await page.setViewportSize(size);
  await page.goto("/#/inbox");

  await expect(inPane(page).getByRole("list", { name: "Earlier" })).toContainText(`Reply ${String(ONE)}`);

  return addresses;
}

async function pressedTimes(page: Page, key: string, times: number): Promise<void> {
  if (times === NONE) {
    return;
  }
  await page.keyboard.press(key);
  await pressedTimes(page, key, times - ONE);
}

test("at 600 px wide, j opens the first conversation and Esc returns to the list", async ({ page }) => {
  await openedWithReadThreads({ channel: "browser-inbox-keys-narrow", count: ONE, page, size: NARROW });
  await page.keyboard.press("j");

  await expect(inConversation(page)).toContainText("Thread 1");
  await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeHidden();

  await page.keyboard.press("Escape");

  await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
  await expect(page).toHaveURL(/#\/inbox$/u);
});

test("at full width, the selected row stays in view after many j presses down a long list", async ({ page }) => {
  const addresses = await openedWithReadThreads({ channel: "browser-inbox-keys-long", count: MANY, page, size: WIDE });
  const target = addresses[PRESSES - ONE] ?? "";
  await pressedTimes(page, "j", PRESSES);

  await expect(page).toHaveURL(new RegExp(`${target}$`, "u"));

  const selected = inPane(page).locator(`a[data-feed-row][href="${target}"]`);

  await expect(selected).toBeFocused();
  await expect(selected).toBeInViewport();
});
