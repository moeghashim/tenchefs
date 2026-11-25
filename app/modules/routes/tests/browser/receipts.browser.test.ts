import type { Browser, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import type { Person } from "./people.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

function bobName(): string {
  return `${unique("browser-receipts")}-bob`;
}

interface Opening {
  readonly browser: Browser;
  readonly token: string;
  readonly hash: string;
}

interface Answered {
  readonly hash: string;
  readonly ann: Person;
  readonly bob: Person;
}

async function openAs({ browser, hash, token }: Opening): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await logInWithStream({ page, token });
  await page.goto(`/${hash}`);
  return page;
}

async function answered(): Promise<Answered> {
  const channel = unique("browser-receipts");
  await adminClient().createChannel({ name: channel });
  const asker = await newIdentity({ kind: "human", name: bobName() });
  const answerer = await newIdentity({ kind: "human", name: `${channel}-ann` });
  const { message: parent } = await asker.client.createMessage({ channel, text: "Deploy at noon?" });
  await answerer.client.createMessage({ channel, replyTo: parent.id, text: "Noon works" });
  return { ann: answerer, bob: asker, hash: `#/channels/${channel}/threads/${String(parent.id)}` };
}

test("when the second person opens the thread, the first sees that they have seen the reply", async ({ browser }) => {
  const opened = await answered();
  const annPage = await openAs({ browser, hash: opened.hash, token: opened.ann.token });
  const reply = annPage.getByRole("feed", { exact: true, name: "Replies" }).getByRole("article");

  await reply.locator("time").focus();

  await expect(annPage.getByRole("tooltip")).toContainText(`Not seen yet: @${bobName()}`);
  await expect(reply).not.toContainText("Not seen yet");

  const bobPage = await openAs({ browser, hash: opened.hash, token: opened.bob.token });

  await expect(bobPage.getByRole("feed", { exact: true, name: "Replies" })).toContainText("Noon works");
  await expect(annPage.getByRole("tooltip")).toContainText(`Seen by @${bobName()} just now`);
});
