import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inConversation, inPane, inThread } from "./regions.ts";
import type { Message } from "../../../sdk/index.ts";
import { logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const WIDE = { height: 900, width: 1400 };
const HALF = "Half a thought";
const ANOTHER = "Another";
const REPLY = "On it";

function messageBox(page: Page): Locator {
  return inPane(page).getByLabel("Message", { exact: true });
}

async function openChannel(page: Page, channel: string): Promise<void> {
  await page.goto(`/#/channels/${channel}`);

  await expect(page.getByRole("region", { exact: true, name: `Messages in #${channel}` })).toBeVisible();
}

interface Channels {
  readonly first: string;
  readonly second: string;
}

async function loggedInWithChannels(page: Page): Promise<Channels> {
  const channels = { first: unique("browser-kept-a"), second: unique("browser-kept-b") };
  const person = await newIdentity({ kind: "human", name: unique("browser-kept-person") });
  await adminClient().createChannel({ name: channels.first });
  await adminClient().createChannel({ name: channels.second });
  await logInToChannels({ page, token: person.token });
  return channels;
}

async function typedInBoth(page: Page, { first, second }: Channels): Promise<void> {
  await openChannel(page, first);
  await messageBox(page).fill(HALF);
  await openChannel(page, second);

  await expect(messageBox(page)).toHaveValue("");

  await messageBox(page).fill(ANOTHER);
}

async function sentAfterAReload(page: Page): Promise<void> {
  await page.reload();

  await expect(messageBox(page)).toHaveValue(HALF);

  await messageBox(page).press("Enter");

  await expect(page.getByRole("feed", { exact: true, name: "Messages" })).toContainText(HALF);
  await expect(messageBox(page)).toHaveValue("");
}

test("a channel's message box keeps its unsent text across channels and a reload, until it is sent", async ({
  page,
}) => {
  const channels = await loggedInWithChannels(page);
  await typedInBoth(page, channels);
  await openChannel(page, channels.first);

  await expect(messageBox(page)).toHaveValue(HALF);
  await expect(messageBox(page)).toHaveJSProperty("selectionStart", HALF.length);

  await sentAfterAReload(page);
  await page.reload();

  await expect(messageBox(page)).toHaveValue("");

  await openChannel(page, channels.second);

  await expect(messageBox(page)).toHaveValue(ANOTHER);
});

interface Followed {
  readonly token: string;
  readonly parent: Message;
  readonly other: Message;
}

async function followedThreads(name: string): Promise<Followed> {
  const channel = unique(name);
  await adminClient().createChannel({ name: channel });
  const person = await newIdentity({ kind: "human", name: unique(`${name}-reader`) });
  const { message: parent } = await adminClient().createMessage({ channel, text: "Deploy at noon?" });
  const { message: other } = await adminClient().createMessage({ channel, text: "Lunch at one?" });
  await person.client.follow(parent.id);
  await adminClient().createMessage({ channel, replyTo: parent.id, text: "Anyone?" });
  return { other, parent, token: person.token };
}

function threadPath(message: Message): string {
  return `/#/channels/${message.channel}/threads/${String(message.id)}`;
}

function replyIn(region: Locator): Locator {
  return region.getByRole("textbox", { exact: true, name: "Reply" });
}

async function typedThenOther(page: Page, { other, parent, token }: Followed): Promise<void> {
  await page.setViewportSize(WIDE);
  await logInToChannels({ page, token });
  await page.goto(threadPath(parent));

  await expect(inThread(page)).toContainText("Anyone?");

  await replyIn(inThread(page)).fill(REPLY);
  await page.goto(threadPath(other));

  await expect(inThread(page)).toContainText("Lunch at one?");
}

async function keptAcrossAReload(page: Page, parent: Message): Promise<void> {
  await page.goto(threadPath(parent));

  await expect(replyIn(inThread(page))).toHaveValue(REPLY);

  await page.reload();

  await expect(replyIn(inThread(page))).toHaveValue(REPLY);
}

async function sentFromTheInbox(page: Page, parent: Message): Promise<void> {
  await page.goto(`/#/inbox/${parent.channel}/${String(parent.id)}`);

  await expect(replyIn(inConversation(page))).toHaveValue(REPLY);
  await expect(replyIn(inConversation(page))).toHaveJSProperty("selectionStart", REPLY.length);

  await replyIn(inConversation(page)).press("Enter");

  await expect(inConversation(page)).toContainText(REPLY);
  await expect(replyIn(inConversation(page))).toHaveValue("");
}

test("a thread's reply box keeps its own unsent text, shared by the thread panel and the Inbox, until it is sent", async ({
  page,
}) => {
  const followed = await followedThreads("browser-kept-thread");
  await typedThenOther(page, followed);

  await expect(replyIn(inThread(page))).toHaveValue("");

  await keptAcrossAReload(page, followed.parent);
  await sentFromTheInbox(page, followed.parent);
  await page.goto(threadPath(followed.parent));

  await expect(inThread(page)).toContainText(REPLY);
  await expect(replyIn(inThread(page))).toHaveValue("");
});
