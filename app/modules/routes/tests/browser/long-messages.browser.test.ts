import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inThread } from "./regions.ts";
import type { MessageId } from "../../../sdk/index.ts";
import type { Person } from "./people.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const LINES = 30;
const FIRST_LINE = 1;
const NONE = 0;
const REPLY_BOX = { exact: true, name: "Reply" } as const;
const UNFOLD = { exact: true, name: "Unfold" } as const;
const ANNOUNCEMENTS = { exact: true, name: "Announcements" } as const;

interface Board {
  readonly channel: string;
  readonly poster: Person;
  readonly reader: Person;
  readonly readerName: string;
}

function longText(title: string): string {
  return Array.from({ length: LINES }, (_line, index) => `${title} line ${String(index + FIRST_LINE)}.`).join("\n\n");
}

function lastLine(title: string): string {
  return `${title} line ${String(LINES)}.`;
}

async function board(name: string): Promise<Board> {
  const channel = unique(name);
  await adminClient().createChannel({ name: channel });
  const poster = await newIdentity({ kind: "agent", name: `${channel}-poster` });
  const readerName = `${channel}-reader`;
  const reader = await newIdentity({ kind: "human", name: readerName });
  await reader.client.subscribe(channel);
  return { channel, poster, reader, readerName };
}

async function posted(on: Board, text: string): Promise<MessageId> {
  const { message } = await on.poster.client.createMessage({ channel: on.channel, text });
  return message.id;
}

async function openChannel(page: Page, on: Board): Promise<void> {
  await logInWithStream({ page, token: on.reader.token, url: `/#/channels/${on.channel}` });
}

async function read(on: Board, title: string): Promise<MessageId> {
  const id = await posted(on, longText(title));
  await on.reader.client.ack(id);
  return id;
}

async function pressedOn(message: Locator, key: string): Promise<void> {
  await message.focus();
  await message.page().keyboard.press(key);
}

async function expectSaid(page: Page, text: string): Promise<void> {
  await expect(page.getByRole("status", ANNOUNCEMENTS).filter({ hasText: text })).toBeAttached();
}

async function expectThreadOpen(page: Page, thread: MessageId): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`/threads/${String(thread)}$`, "u"));
  await expect(inThread(page).getByRole("textbox", REPLY_BOX)).toBeFocused();
}

function channelMessage(page: Page, title: string): Locator {
  return inPane(page)
    .getByRole("feed", { exact: true, name: "Messages" })
    .getByRole("article")
    .filter({ hasText: `${title} line 1.` });
}

async function clickedOpen(page: Page, on: Board): Promise<Locator> {
  await read(on, "Clicked");
  await openChannel(page, on);
  return channelMessage(page, "Clicked");
}

async function expectFolded(message: Locator, title: string): Promise<void> {
  await expect(message.getByRole("button", UNFOLD)).toBeVisible();

  await message.scrollIntoViewIfNeeded();

  await expect(message.getByText(lastLine(title), { exact: true })).not.toBeInViewport();
}

async function expectUnfolded(message: Locator, title: string): Promise<void> {
  const last = message.getByText(lastLine(title), { exact: true });

  await expect(last).toBeVisible();
  await expect(message.getByRole("button", UNFOLD)).toHaveCount(NONE);

  await last.scrollIntoViewIfNeeded();

  await expect(last).toBeInViewport();
}

test("a 30-line message you've read shows folded, and Enter on it unfolds it in place", async ({ page }) => {
  const on = await board("browser-long-read");
  await read(on, "Read");
  await openChannel(page, on);
  const message = channelMessage(page, "Read");

  await expectFolded(message, "Read");

  await pressedOn(message, "Enter");

  await expectUnfolded(message, "Read");
  await expectSaid(page, "Expanded");

  await expect(page).toHaveURL(new RegExp(`/channels/${on.channel}$`, "u"));
  await expect(message).toBeFocused();
});

test("a 30-line message mentioning you, and one below the New line, show unfolded", async ({ page }) => {
  const on = await board("browser-long-for-you");
  const mention = await posted(on, `@${on.readerName} ${longText("Mention")}`);
  await on.reader.client.ack(mention);
  await posted(on, longText("Fresh"));
  await openChannel(page, on);

  await expect(inPane(page).getByRole("feed", { exact: true, name: "Messages" })).toContainText("New");

  await expectUnfolded(channelMessage(page, "Mention"), "Mention");
  await expectUnfolded(channelMessage(page, "Fresh"), "Fresh");
});

test("a 30-line message you wrote shows unfolded", async ({ page }) => {
  const on = await board("browser-long-mine");
  const { message } = await on.reader.client.createMessage({ channel: on.channel, text: longText("Mine") });
  await on.reader.client.ack(message.id);
  await openChannel(page, on);

  await expectUnfolded(channelMessage(page, "Mine"), "Mine");
});

interface Shown {
  readonly id: MessageId;
  readonly message: Locator;
}

interface FoldedAndFresh {
  readonly folded: Shown;
  readonly fresh: Shown;
}

async function foldedAndFresh(page: Page): Promise<FoldedAndFresh> {
  const on = await board("browser-long-keys");
  const folded = await read(on, "Folded");
  const fresh = await posted(on, longText("Fresh"));
  await openChannel(page, on);
  return {
    folded: { id: folded, message: channelMessage(page, "Folded") },
    fresh: { id: fresh, message: channelMessage(page, "Fresh") },
  };
}

test("Enter on an unfolded message opens its thread, and → on a folded one opens its thread", async ({ page }) => {
  const { folded, fresh } = await foldedAndFresh(page);
  const foldedMessage = folded.message;
  const freshMessage = fresh.message;

  await expectFolded(foldedMessage, "Folded");
  await expectUnfolded(freshMessage, "Fresh");

  await pressedOn(freshMessage, "Enter");

  await expectThreadOpen(page, fresh.id);

  await pressedOn(foldedMessage, "ArrowRight");

  await expectThreadOpen(page, folded.id);
  await expectFolded(foldedMessage, "Folded");
});

test("clicking a folded message's faded end unfolds it, and it stays unfolded", async ({ page }) => {
  const on = await board("browser-long-click");
  const message = await clickedOpen(page, on);

  await expectFolded(message, "Clicked");

  await message.getByRole("button", UNFOLD).click();

  await expectUnfolded(message, "Clicked");
  await expectSaid(page, "Expanded");

  await posted(on, "A short one after.");

  await expect(inPane(page)).toContainText("A short one after.");

  await expectUnfolded(message, "Clicked");
});

test("a short message you've read shows in full, with nothing to unfold", async ({ page }) => {
  const on = await board("browser-long-short");
  const short = await posted(on, "Short line 1. Short line 30.");
  await on.reader.client.ack(short);
  await openChannel(page, on);
  const message = channelMessage(page, "Short");

  await expect(message).toContainText("Short line 30.");
  await expect(message.getByRole("button", UNFOLD)).toHaveCount(NONE);
});

test("a long reply you've read folds in the thread panel too", async ({ page }) => {
  const on = await board("browser-long-thread");
  const parent = await posted(on, "A short parent.");
  const { message: reply } = await on.poster.client.createMessage({
    channel: on.channel,
    replyTo: parent,
    text: longText("Reply"),
  });
  await on.reader.client.follow(parent);
  await on.reader.client.ack(reply.id);
  await logInWithStream({
    page,
    token: on.reader.token,
    url: `/#/channels/${on.channel}/threads/${String(parent)}`,
  });
  const shown = inThread(page)
    .getByRole("feed", { exact: true, name: "Replies" })
    .getByRole("article")
    .filter({ hasText: "Reply line 1." });

  await expectFolded(shown, "Reply");
});
