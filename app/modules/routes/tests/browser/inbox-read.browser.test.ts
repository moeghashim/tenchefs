import type { Browser, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import type { Person } from "./people.ts";
import { inConversation } from "./regions.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const CHANNEL = "browser-inbox-read";
const NOT_BEFORE_MILLIS = 1500;
const WITHIN_MILLIS = 10_000;

interface Opening {
  readonly browser: Browser;
  readonly token: string;
  readonly hash: string;
}

interface Answered {
  readonly thread: string;
  readonly inbox: string;
  readonly ann: Person;
  readonly bob: Person;
  readonly bobName: string;
}

async function openAs({ browser, hash, token }: Opening): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await logInWithStream({ page, token });
  await page.goto(`/${hash}`);
  return page;
}

async function answered(): Promise<Answered> {
  const channel = unique(CHANNEL);
  const bobName = `${channel}-bob`;
  await adminClient().createChannel({ name: channel });
  const asker = await newIdentity({ kind: "human", name: bobName });
  const answerer = await newIdentity({ kind: "human", name: `${channel}-ann` });
  const { message: parent } = await asker.client.createMessage({ channel, text: "Deploy at noon?" });
  await answerer.client.createMessage({ channel, replyTo: parent.id, text: "Noon works" });
  return {
    ann: answerer,
    bob: asker,
    bobName,
    inbox: `#/inbox/${channel}/${String(parent.id)}`,
    thread: `#/channels/${channel}/threads/${String(parent.id)}`,
  };
}

test("the first person sees a read receipt about 2 s after the second selects the row in the Inbox, not before", async ({
  browser,
}) => {
  const opened = await answered();
  const annPage = await openAs({ browser, hash: opened.thread, token: opened.ann.token });
  await annPage.getByRole("feed", { exact: true, name: "Replies" }).getByRole("article").locator("time").focus();

  await expect(annPage.getByRole("tooltip")).toContainText(`Not seen yet: @${opened.bobName}`);

  const bobPage = await openAs({ browser, hash: opened.inbox, token: opened.bob.token });
  await bobPage.bringToFront();

  await expect(inConversation(bobPage)).toContainText("Noon works");

  const shownAt = performance.now();

  await expect(annPage.getByRole("tooltip")).toContainText(`Seen by @${opened.bobName}`, { timeout: WITHIN_MILLIS });
  expect(performance.now() - shownAt).toBeGreaterThan(NOT_BEFORE_MILLIS);
});
