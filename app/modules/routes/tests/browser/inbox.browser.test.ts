import type { Browser, Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { inPane, inSidebar, inThread } from "./regions.ts";
import { logIn, logInToChannels, logInWithStream } from "./login.ts";
import type { MessageId } from "../../../sdk/index.ts";
import type { Person } from "./people.ts";

const ONE = 1;
const A_PAGE_AND_ONE = 51;

interface Reading {
  readonly poster: Person;
  readonly reader: Person;
}

async function openInbox(page: Page): Promise<void> {
  const streamOpen = page.waitForResponse((response) => response.url().includes("/v1/events"));
  await page.goto("/#/inbox");

  await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();

  await streamOpen;
}

async function subscribedPerson(channel: string): Promise<Reading> {
  await adminClient().createChannel({ name: channel });
  const poster = await newIdentity({ kind: "agent", name: `${channel}-poster` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await reader.client.subscribe(channel);
  return { poster, reader };
}

function rows(page: Page, list: string): Locator {
  return page.getByRole("list", { name: list }).getByRole("listitem");
}

async function postFrom(poster: Person, channel: string, build: number): Promise<MessageId> {
  const { message } = await poster.client.createMessage({ channel, text: `Build ${String(build)} passed` });
  if (build === A_PAGE_AND_ONE) {
    return message.id;
  }
  const last = await postFrom(poster, channel, build + ONE);
  return last;
}

async function logInHavingRead(page: Page, channel: string): Promise<void> {
  const { poster, reader } = await subscribedPerson(channel);
  await reader.client.ack(await postFrom(poster, channel, ONE));
  await logInToChannels({ page, token: reader.token });
}

async function mentionedInThread(channel: string): Promise<Person> {
  const { poster, reader } = await subscribedPerson(channel);
  const { message: parent } = await poster.client.createMessage({ channel, text: "Deploy at noon?" });
  await poster.client.createMessage({ channel, text: "Or at one?" });
  await poster.client.createMessage({
    channel,
    replyTo: parent.id,
    text: `@${channel}-reader can you check the rollout?`,
  });
  return reader;
}

test("the inbox lists the identity's unread rows for you, then activity, each leading with why", async ({ page }) => {
  const channel = "browser-inbox";
  const reader = await mentionedInThread(channel);
  await logInToChannels({ page, token: reader.token });

  await inSidebar(page)
    .getByRole("link", { name: /^Inbox/u })
    .click();

  await expect(page.getByRole("heading", { level: 2, name: "For you 1" })).toBeVisible();
  await expect(rows(page, "For you")).toHaveText([
    `Mentioned you${channel}-posterreplied in a thread in#${channel}just nowre: Deploy at noon?@${channel}-reader can you check the rollout?`,
  ]);
  await expect(rows(page, "Activity")).toHaveText([
    `New in #${channel}${channel}-posterposted in#${channel}2 newjust nowOr at one?`,
  ]);
  await expect(page.getByText("Nothing read yet.")).toBeVisible();
});

async function inboxInSecondTab(page: Page, channel: string): Promise<Page> {
  const { poster, reader } = await subscribedPerson(channel);
  await poster.client.createMessage({ channel, text: "Deploy at noon?" });
  await logInToChannels({ page, token: reader.token });
  const second = await page.context().newPage();
  await openInbox(second);
  return second;
}

async function openChannel(page: Page, channel: string, text: string): Promise<void> {
  await inSidebar(page)
    .getByRole("link", { name: new RegExp(`^#${channel}(?![a-z-])`, "u") })
    .click();

  await expect(page.getByRole("list", { name: "Messages" })).toContainText(text);
}

test("acking in one tab moves the item from Activity to Earlier in another", async ({ page }) => {
  const channel = "browser-inbox-tabs";
  const second = await inboxInSecondTab(page, channel);

  await expect(rows(second, "Activity")).toHaveCount(ONE);

  await openChannel(page, channel, "Deploy at noon?");

  await expect(second.getByText("You're all caught up.")).toBeVisible();
  await expect(rows(second, "Earlier")).toContainText(["Deploy at noon?"]);
});

test("Show earlier reads the next page of what was read into the rows shown, and the end says so", async ({ page }) => {
  await logInHavingRead(page, "browser-inbox-more");

  await expect(rows(page, "Earlier")).toHaveText([/Build 51 passed$/u]);
  await expect(page.getByText("That's everything.")).toBeHidden();

  await inPane(page).getByRole("button", { name: "Show earlier" }).click();

  await expect(page.getByText("That's everything.")).toBeVisible();
  await expect(rows(page, "Earlier")).toHaveText([/Build 51 passed$/u]);
  await expect(inPane(page).getByRole("button", { name: "Show earlier" })).toBeHidden();
});

async function replyFromElsewhere(browser: Browser, poster: Person, thread: string): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await logIn({ page, token: poster.token, url: thread });
  await inThread(page).getByRole("textbox", { exact: true, name: "Reply" }).fill("Noon works");
  await inThread(page).getByRole("button", { name: "Send" }).click();

  await expect(inThread(page).getByRole("list", { name: "Replies" })).toContainText("Noon works");

  await context.close();
}

test("a reply posted by another identity joins its thread's row live", async ({ browser, page }) => {
  const channel = "browser-inbox-row-live";
  const { reader } = await subscribedPerson(channel);
  const poster = await newIdentity({ kind: "human", name: `${channel}-replier` });
  const { message: parent } = await reader.client.createMessage({ channel, text: "Deploy at noon?" });
  await poster.client.createMessage({ channel, replyTo: parent.id, text: "Maybe" });
  await logInWithStream({ page, token: reader.token, url: "/#/inbox" });

  await expect(rows(page, "For you")).toHaveText([/Maybe$/u]);

  await replyFromElsewhere(browser, poster, `/#/channels/${channel}/threads/${String(parent.id)}`);

  await expect(rows(page, "For you")).toHaveText([/Replied to you.*2 new.*Noon works$/u]);
});
