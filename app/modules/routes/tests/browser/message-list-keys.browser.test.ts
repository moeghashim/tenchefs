import type { CreateMessageRequest, MessageId } from "../../../sdk/index.ts";
import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inThread } from "./regions.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const THIRTY = 30;
const REPLIES = 5;
const MORE_THAN_A_PAGE = 55;
const OLDEST_LOADED = 6;
const TAB_LIMIT = 40;
const PAD = 2;
const FIRST = 1;
const NONE = 0;

interface Posting {
  readonly channel: string;
  readonly count: number;
  readonly replyTo: MessageId | null;
}

function noteOf(index: number): string {
  return `Note ${String(index).padStart(PAD, "0")}`;
}

function requestOf(posting: Posting, index: number): CreateMessageRequest {
  const request = { channel: posting.channel, text: noteOf(index) };
  if (posting.replyTo === null) {
    return request;
  }
  return { ...request, replyTo: posting.replyTo };
}

async function postedFrom(posting: Posting, index: number): Promise<readonly MessageId[]> {
  if (index > posting.count) {
    return [];
  }
  const { message } = await adminClient().createMessage(requestOf(posting, index));
  const later = await postedFrom(posting, index + FIRST);
  return [message.id, ...later];
}

async function openedWith(page: Page, posting: Posting): Promise<readonly MessageId[]> {
  await adminClient().createChannel({ name: posting.channel });
  const ids = await postedFrom(posting, FIRST);
  const { token } = await newIdentity({ kind: "human", name: `${posting.channel}-reader` });
  await logInWithStream({ page, token });
  await page.goto(`/#/channels/${posting.channel}`);
  return ids;
}

function messagesOn(page: Page): Locator {
  return inPane(page).getByRole("feed", { exact: true, name: "Messages" });
}

function focusedMessage(page: Page): Locator {
  return page.locator("article:focus");
}

async function focusNewest(page: Page, text: string): Promise<void> {
  const newest = messagesOn(page).getByRole("article").filter({ hasText: text });

  await expect(newest).toBeVisible();

  await newest.focus();
}

async function pressAndSee(page: Page, key: string, text: string): Promise<void> {
  await page.keyboard.press(key);

  await expect(focusedMessage(page)).toContainText(text);
}

async function inFeed(page: Page): Promise<boolean> {
  const inside = await page.evaluate(() => document.querySelector("[role=feed]:focus-within") !== null);
  return inside;
}

async function focusedArticleText(page: Page): Promise<string> {
  const text = await page.evaluate(() => {
    const article = document.querySelector("article:focus-within");
    if (article === null) {
      return "";
    }
    return article.textContent;
  });
  return text;
}

interface Walk {
  readonly page: Page;
  readonly key: string;
  readonly left: number;
}

async function walkedInFeed({ key, left, page }: Walk): Promise<readonly string[]> {
  if (left === NONE) {
    return [];
  }
  await page.keyboard.press(key);
  if (!(await inFeed(page))) {
    return [];
  }
  const article = await focusedArticleText(page);
  const rest = await walkedInFeed({ key, left: left - FIRST, page });
  return [article, ...rest];
}

test("a channel of 30 messages is one Tab stop: Tab walks one message's own controls, then leaves the list", async ({
  page,
}) => {
  await openedWith(page, { channel: unique("browser-keys-tab"), count: THIRTY, replyTo: null });
  await page.getByRole("textbox", { exact: true, name: "Message" }).focus();

  const backwards = await walkedInFeed({ key: "Shift+Tab", left: TAB_LIMIT, page });

  expect([backwards.length > NONE, backwards.every((text) => text.includes(noteOf(THIRTY)))]).toStrictEqual([
    true,
    true,
  ]);

  await pressAndSee(page, "Tab", noteOf(THIRTY));
  const forwards = await walkedInFeed({ key: "Tab", left: TAB_LIMIT, page });

  expect(forwards.every((text) => text.includes(noteOf(THIRTY)))).toBe(true);
  await expect(page.getByRole("textbox", { exact: true, name: "Message" })).toBeFocused();
});

test("arrow keys, j and k move one message, and Home and End reach the ends", async ({ page }) => {
  await openedWith(page, { channel: unique("browser-keys-arrows"), count: THIRTY, replyTo: null });
  await focusNewest(page, noteOf(THIRTY));

  await pressAndSee(page, "ArrowUp", noteOf(THIRTY - FIRST));
  await pressAndSee(page, "k", noteOf(THIRTY - FIRST - FIRST));
  await pressAndSee(page, "j", noteOf(THIRTY - FIRST));
  await pressAndSee(page, "ArrowDown", noteOf(THIRTY));
  await pressAndSee(page, "Home", noteOf(FIRST));
  await pressAndSee(page, "End", noteOf(THIRTY));
});

test("a live message arriving keeps focus on the message it was on", async ({ page }) => {
  const channel = unique("browser-keys-live");
  await openedWith(page, { channel, count: THIRTY, replyTo: null });
  await focusNewest(page, noteOf(THIRTY));
  await page.keyboard.press("Home");

  await adminClient().createMessage({ channel, text: "Arrived live." });

  await expect(messagesOn(page).getByText("Arrived live.", { exact: true })).toBeVisible();
  await expect(focusedMessage(page)).toContainText(noteOf(FIRST));
});

test("up past the oldest loaded message loads older ones, and focus stays where it was", async ({ page }) => {
  await openedWith(page, { channel: unique("browser-keys-older"), count: MORE_THAN_A_PAGE, replyTo: null });
  await focusNewest(page, noteOf(MORE_THAN_A_PAGE));
  await page.keyboard.press("Home");

  await expect(focusedMessage(page)).toContainText(noteOf(OLDEST_LOADED));
  await expect(messagesOn(page).getByRole("article").first()).toHaveAttribute("aria-setsize", "-1");

  await page.keyboard.press("ArrowUp");

  await expect(messagesOn(page).getByText(noteOf(FIRST), { exact: true })).toBeVisible();
  await expect(focusedMessage(page)).toContainText(noteOf(OLDEST_LOADED));

  await pressAndSee(page, "ArrowUp", noteOf(OLDEST_LOADED - FIRST));
});

async function openedWithFold(page: Page, channel: string): Promise<void> {
  await adminClient().createChannel({ name: channel });
  const { message: closed } = await adminClient().createMessage({ channel, text: "Done and dusted." });
  await adminClient().closeThread(closed.id);
  await adminClient().createMessage({ channel, text: "Still open." });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInWithStream({ page, token });
  await page.goto(`/#/channels/${channel}`);
}

test("Enter on a fold of closed threads unfolds it", async ({ page }) => {
  await openedWithFold(page, unique("browser-keys-fold"));
  await focusNewest(page, "Still open.");

  await page.keyboard.press("ArrowUp");

  await expect(focusedMessage(page)).toHaveAccessibleName("1 closed thread");

  await page.keyboard.press("Enter");

  await expect(messagesOn(page).getByText("Done and dusted.", { exact: true })).toBeVisible();
  await expect(focusedMessage(page)).toContainText("Done and dusted.");
});

async function openedThread(page: Page, channel: string): Promise<void> {
  await adminClient().createChannel({ name: channel });
  const { message: parent } = await adminClient().createMessage({ channel, text: "The parent." });
  await postedFrom({ channel, count: REPLIES, replyTo: parent.id }, FIRST);
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInWithStream({ page, token });
  await page.goto(`/#/channels/${channel}/threads/${String(parent.id)}`);
}

test("the same keys move between an open thread's replies, with Home on its top message", async ({ page }) => {
  await openedThread(page, unique("browser-keys-thread"));
  const replies = inThread(page).getByRole("feed", { exact: true, name: "Replies" });
  await replies
    .getByRole("article")
    .filter({ hasText: noteOf(REPLIES) })
    .focus();

  await pressAndSee(page, "ArrowUp", noteOf(REPLIES - FIRST));
  await pressAndSee(page, "k", noteOf(REPLIES - FIRST - FIRST));
  await pressAndSee(page, "j", noteOf(REPLIES - FIRST));
  await pressAndSee(page, "Home", "The parent.");
  await pressAndSee(page, "End", noteOf(REPLIES));
});
