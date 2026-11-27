import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inThread } from "./regions.ts";
import type { MessageId } from "../../../sdk/index.ts";
import type { Person } from "./people.ts";
import { logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const DRAFT = "Half a thought";

interface Posted {
  readonly channel: string;
  readonly author: string;
  readonly thread: MessageId;
}

async function channelWithMessage(page: Page, name: string): Promise<Posted> {
  const channel = unique(name);
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: "Ship it?" });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInToChannels({ page, token });
  await page.goto(`/#/channels/${channel}`);
  return { author: message.author.name, channel, thread: message.id };
}

function channelMessage(page: Page): Locator {
  return inPane(page).getByRole("feed", { exact: true, name: "Messages" }).getByRole("article");
}

function replyBox(page: Page): Locator {
  return inThread(page).getByRole("textbox", { exact: true, name: "Reply" });
}

async function pressReply(page: Page): Promise<void> {
  const message = channelMessage(page);
  await message.focus();
  const reply = message
    .getByRole("group", { exact: true, name: "Quick actions" })
    .getByRole("link", { exact: true, name: "Reply" });
  await reply.focus();
  await page.keyboard.press("Enter");
}

test("Reply on another identity's channel message focuses the thread's box holding a mention of its author, and sends a reply that mentions them", async ({
  page,
}) => {
  const { author, thread } = await channelWithMessage(page, "browser-reply-mention");

  await pressReply(page);

  await expect(replyBox(page)).toBeFocused();
  await expect(replyBox(page)).toHaveValue(`@${author} `);

  await page.keyboard.type("on it");
  await page.keyboard.press("Enter");

  await expect
    .poll(async () => {
      const { replies } = await adminClient().getThread(thread);
      return replies.map((reply) => ({ mentions: reply.mentions, text: reply.text }));
    })
    .toStrictEqual([{ mentions: [author], text: `@${author} on it` }]);
});

test("R on a focused channel message opens its thread with a mention of its author in the focused box", async ({
  page,
}) => {
  const { author } = await channelWithMessage(page, "browser-reply-mention-key");
  await channelMessage(page).focus();

  await page.keyboard.press("r");

  await expect(replyBox(page)).toBeFocused();
  await expect(replyBox(page)).toHaveValue(`@${author} `);
});

async function ownMessage(page: Page, name: string): Promise<void> {
  const channel = unique(name);
  await adminClient().createChannel({ name: channel });
  const reader: Person = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await reader.client.createMessage({ channel, text: "My own note" });
  await logInToChannels({ page, token: reader.token });
  await page.goto(`/#/channels/${channel}`);
}

test("Reply on your own channel message focuses the thread's box with no mention", async ({ page }) => {
  await ownMessage(page, "browser-reply-mention-own");

  await pressReply(page);

  await expect(replyBox(page)).toBeFocused();
  await expect(replyBox(page)).toHaveValue("");
});

test("Reply on a channel message whose thread's box holds a draft keeps the draft and focuses the box", async ({
  page,
}) => {
  const { author, channel, thread } = await channelWithMessage(page, "browser-reply-mention-draft");
  await page.goto(`/#/channels/${channel}/threads/${String(thread)}`);
  await replyBox(page).fill(DRAFT);

  await pressReply(page);

  await expect(replyBox(page)).toBeFocused();
  await expect(replyBox(page)).toHaveValue(`@${author} ${DRAFT}`);
});
