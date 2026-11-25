import type { Browser, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inConversation, inThread } from "./regions.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const CHANNEL = "browser-inbox-reply";

interface Opening {
  readonly browser: Browser;
  readonly token: string;
  readonly hash: string;
}

interface Asked {
  readonly asker: string;
  readonly answerer: string;
  readonly channel: string;
  readonly parent: string;
}

async function openAs({ browser, hash, token }: Opening): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await logInWithStream({ page, token });
  await page.goto(`/${hash}`);
  return page;
}

async function asked(): Promise<Asked> {
  const channel = unique(CHANNEL);
  await adminClient().createChannel({ name: channel });
  const asker = await newIdentity({ kind: "human", name: `${channel}-asker` });
  const answerer = await newIdentity({ kind: "human", name: `${channel}-answerer` });
  const { message: parent } = await asker.client.createMessage({ channel, text: "Deploy at noon?" });
  await answerer.client.follow(parent.id);
  await asker.client.createMessage({ channel, replyTo: parent.id, text: "Anyone?" });
  return { answerer: answerer.token, asker: asker.token, channel, parent: String(parent.id) };
}

test("a reply sent with Enter from the Inbox shows in the conversation, and live in another person's open thread", async ({
  browser,
}) => {
  const thread = await asked();
  const watching = await openAs({
    browser,
    hash: `#/channels/${thread.channel}/threads/${thread.parent}`,
    token: thread.asker,
  });

  await expect(inThread(watching)).toContainText("Anyone?");

  const replying = await openAs({
    browser,
    hash: `#/inbox/${thread.channel}/${thread.parent}`,
    token: thread.answerer,
  });
  const box = inConversation(replying).getByRole("textbox", { exact: true, name: "Reply" });
  await box.fill("Noon works");
  await box.press("Enter");

  await expect(inConversation(replying)).toContainText("Noon works");
  await expect(box).toHaveValue("");
  await expect(inThread(watching)).toContainText("Noon works");
});
