import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import type { MessageId } from "../../../sdk/index.ts";
import { inThread } from "./regions.ts";
import { logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const REPLIES = 50;
const SHOWN = 20;
const FIRST_SHOWN = 31;
const FIFTH = 5;
const FIRST = 1;
const PAD = 2;
const INSTALLED_AT = "2030-01-01T00:00:00Z";
const PAUSED_AT = "2030-01-01T00:01:00Z";

interface LongThread {
  readonly channel: string;
  readonly parent: MessageId;
  readonly replies: readonly MessageId[];
}

function replyText(index: number): string {
  return `Reply ${String(index).padStart(PAD, "0")}`;
}

async function repliedFrom(thread: Omit<LongThread, "replies">, index: number): Promise<readonly MessageId[]> {
  if (index > REPLIES) {
    return [];
  }
  const { message } = await adminClient().createMessage({
    channel: thread.channel,
    replyTo: thread.parent,
    text: replyText(index),
  });
  const later = await repliedFrom(thread, index + FIRST);
  return [message.id, ...later];
}

async function longThread(name: string): Promise<LongThread> {
  const channel = unique(name);
  await adminClient().createChannel({ name: channel });
  const { message: parent } = await adminClient().createMessage({ channel, text: "The long thread." });
  const replies = await repliedFrom({ channel, parent: parent.id }, FIRST);
  return { channel, parent: parent.id, replies };
}

function threadHash({ channel, parent }: LongThread): string {
  return `/#/channels/${channel}/threads/${String(parent)}`;
}

async function openedThread(page: Page, name: string): Promise<LongThread> {
  const thread = await longThread(name);
  const reader = await newIdentity({ kind: "human", name: unique(`${name}-reader`) });
  await logInToChannels({ page, token: reader.token });
  await page.goto(threadHash(thread));
  return thread;
}

function repliesIn(page: Page): Locator {
  return inThread(page)
    .getByRole("article")
    .filter({ hasText: /Reply \d\d/u });
}

function earlierButton(page: Page): Locator {
  return inThread(page).getByRole("button", { exact: true, name: "30 earlier replies" });
}

test('a thread with 50 replies shows its top message, "30 earlier replies" and the newest 20', async ({ page }) => {
  await openedThread(page, "browser-earlier-shown");

  await expect(inThread(page).getByRole("article", { exact: true, name: "Parent message" })).toContainText(
    "The long thread.",
  );
  await expect(earlierButton(page)).toBeVisible();
  await expect(repliesIn(page)).toHaveCount(SHOWN);
  await expect(repliesIn(page).first()).toContainText(replyText(FIRST_SHOWN));
  await expect(repliesIn(page).last()).toContainText(replyText(REPLIES));
});

test('Enter on "30 earlier replies" shows all 50, with focus on the reply that was first', async ({ page }) => {
  await openedThread(page, "browser-earlier-enter");
  await earlierButton(page).focus();

  await page.keyboard.press("Enter");

  await expect(repliesIn(page)).toHaveCount(REPLIES);
  await expect(repliesIn(page).first()).toContainText(replyText(FIRST));
  await expect(repliesIn(page).filter({ hasText: replyText(FIRST_SHOWN) })).toBeFocused();
});

test('↑ from the oldest reply shown focuses "30 earlier replies", and ↑ again the top message', async ({ page }) => {
  await openedThread(page, "browser-earlier-up");
  await repliesIn(page).first().focus();

  await page.keyboard.press("ArrowUp");

  await expect(earlierButton(page)).toBeFocused();

  await page.keyboard.press("ArrowUp");

  await expect(inThread(page).getByRole("article", { exact: true, name: "Parent message" })).toBeFocused();
});

test("a link to the 5th reply opens it scrolled into view and highlighted", async ({ page }) => {
  const thread = await longThread("browser-earlier-link");
  const reader = await newIdentity({ kind: "human", name: unique("browser-earlier-link-reader") });
  await logInToChannels({ page, token: reader.token });
  await page.goto(`${threadHash(thread)}/messages/${String(thread.replies[FIFTH - FIRST])}`);
  await page.clock.install({ time: INSTALLED_AT });
  await page.clock.pauseAt(PAUSED_AT);
  await page.reload();
  const fifth = repliesIn(page).filter({ hasText: replyText(FIFTH) });

  await expect(fifth).toHaveAttribute("aria-current", "true");
  await expect(fifth).toBeInViewport();
});
