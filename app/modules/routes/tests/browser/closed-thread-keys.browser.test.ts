import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inThread } from "./regions.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const PARENT = "The closed parent.";
const REPLY = "The closed reply.";

interface Opening {
  readonly page: Page;
  readonly channel: string;
  readonly closed: boolean;
}

async function seeded({ channel, closed }: Omit<Opening, "page">): Promise<number> {
  await adminClient().createChannel({ name: channel });
  await adminClient().createMessage({ channel, text: "Before." });
  const { message } = await adminClient().createMessage({ channel, text: PARENT });
  await adminClient().createMessage({ channel, replyTo: message.id, text: REPLY });
  await adminClient().createMessage({ channel, text: "After." });
  if (closed) {
    await adminClient().closeThread(message.id);
  }
  return message.id;
}

async function threadOpened({ channel, closed, page }: Opening): Promise<void> {
  const parent = await seeded({ channel, closed });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInWithStream({ page, token });
  await page.goto(`/#/channels/${channel}/threads/${String(parent)}`);

  await expect(inThread(page).getByText(REPLY, { exact: true })).toBeVisible();
}

async function closedThreadOpened(page: Page, channel: string): Promise<void> {
  await threadOpened({ channel, closed: true, page });
}

function channelFold(page: Page): Locator {
  return inPane(page)
    .getByRole("feed", { exact: true, name: "Messages" })
    .getByRole("article", { exact: true, name: "1 closed thread" });
}

function channelMessage(page: Page, text = PARENT): Locator {
  return inPane(page)
    .getByRole("feed", { exact: true, name: "Messages" })
    .getByRole("article")
    .filter({ hasText: text });
}

function afterFold(page: Page): Locator {
  return channelMessage(page, "After.");
}

function threadParent(page: Page): Locator {
  return inThread(page).getByRole("article", { exact: true, name: "Parent message" });
}

function threadReply(page: Page): Locator {
  return inThread(page).getByRole("feed", { exact: true, name: "Replies" }).getByRole("article").filter({
    hasText: REPLY,
  });
}

test("← from a message in a closed thread's panel puts focus on the channel message after the fold holding it, with the panel still open", async ({
  page,
}) => {
  await closedThreadOpened(page, unique("browser-closed-thread-keys-left"));
  await threadReply(page).focus();

  await page.keyboard.press("ArrowLeft");

  await expect(afterFold(page)).toBeFocused();
  await expect(threadParent(page)).toBeVisible();

  await threadParent(page).focus();
  await page.keyboard.press("ArrowLeft");

  await expect(afterFold(page)).toBeFocused();
});

const PLACES = [
  {
    focus: async (page: Page): Promise<void> => {
      await threadReply(page).focus();
    },
    place: "a reply",
  },
  {
    focus: async (page: Page): Promise<void> => {
      await threadParent(page).focus();
    },
    place: "the top message",
  },
  {
    focus: async (page: Page): Promise<void> => {
      await inThread(page).getByText("1 reply", { exact: true }).click();
    },
    place: "the panel itself after a click",
  },
] as const;

for (const { focus, place } of PLACES) {
  test(`Escape from ${place} in a closed thread's panel closes it, with focus on the channel message after the fold holding it`, async ({
    page,
  }) => {
    const channel = unique("browser-closed-thread-keys-escape");
    await closedThreadOpened(page, channel);
    await focus(page);

    await page.keyboard.press("Escape");

    await expect(inThread(page)).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`#/channels/${channel}$`, "u"));
    await expect(afterFold(page)).toBeFocused();
  });
}

test("k after Escape closes a closed thread's panel carries on from the message after its fold to the fold", async ({
  page,
}) => {
  await closedThreadOpened(page, unique("browser-closed-thread-keys-carry-on"));
  await threadReply(page).focus();
  await page.keyboard.press("Escape");

  await expect(afterFold(page)).toBeFocused();

  await page.keyboard.press("k");

  await expect(channelFold(page)).toBeFocused();
});

const MOVES = [
  { from: threadParent, key: "j", to: threadReply },
  { from: threadReply, key: "k", to: threadParent },
  { from: threadParent, key: "ArrowDown", to: threadReply },
  { from: threadReply, key: "ArrowUp", to: threadParent },
  { from: threadParent, key: "End", to: threadReply },
  { from: threadReply, key: "Home", to: threadParent },
] as const;

for (const { from, key, to } of MOVES) {
  test(`${key} moves between a closed thread's messages`, async ({ page }) => {
    await closedThreadOpened(page, unique(`browser-closed-thread-keys-move-${key.toLowerCase()}`));
    await from(page).focus();

    await page.keyboard.press(key);

    await expect(to(page)).toBeFocused();
  });
}

test("+ on a message in a closed thread's panel reacts to it", async ({ page }) => {
  await closedThreadOpened(page, unique("browser-closed-thread-keys-react"));
  await threadReply(page).focus();

  await page.keyboard.press("+");

  await expect(threadReply(page).getByRole("button", { exact: true, name: "👍 1" })).toBeVisible();
});

const CONTROLS = [
  { closed: true, control: "Reopen thread", landing: afterFold },
  { closed: false, control: "Close thread", landing: channelMessage },
] as const;

for (const { closed, control, landing } of CONTROLS) {
  test(`Escape from the thread bar's ${control} control hides its tooltip, then closes the panel`, async ({ page }) => {
    await threadOpened({ channel: unique("browser-closed-thread-keys-bar"), closed, page });
    const tooltip = page.getByRole("tooltip");
    await inThread(page).getByRole("button", { exact: true, name: control }).focus();

    await expect(tooltip).toHaveText(control);

    await page.keyboard.press("Escape");

    await expect(tooltip).toBeHidden();
    await expect(inThread(page)).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(inThread(page)).toBeHidden();
    await expect(landing(page)).toBeFocused();
  });
}
