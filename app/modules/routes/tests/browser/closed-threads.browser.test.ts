import type { Browser, Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

function channelName(): string {
  return unique("browser-closed-threads");
}

interface Opening {
  readonly browser: Browser;
  readonly token: string;
}

interface Tokens {
  readonly ann: string;
  readonly bob: string;
}

async function openAs({ browser, token }: Opening): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await logInWithStream({ page, token });
  await page.goto(`/#/channels/${channelName()}`);
  return page;
}

function messagesOn(page: Page): Locator {
  return inPane(page).getByRole("feed", { exact: true, name: "Messages" });
}

async function posted(): Promise<Tokens> {
  const channel = channelName();
  await adminClient().createChannel({ name: channel });
  const author = await newIdentity({ kind: "human", name: `${channel}-ann` });
  const closer = await newIdentity({ kind: "human", name: `${channel}-bob` });
  await author.client.createMessage({ channel, text: "Before." });
  await author.client.createMessage({ channel, text: "Ship it?" });
  await author.client.createMessage({ channel, text: "After." });
  return { ann: author.token, bob: closer.token };
}

test("a thread one person closes from its menu folds in another person's feed with no reload", async ({ browser }) => {
  const tokens = await posted();
  const annMessages = messagesOn(await openAs({ browser, token: tokens.ann }));
  const bobMessages = messagesOn(await openAs({ browser, token: tokens.bob }));

  await expect(annMessages.getByText("Ship it?", { exact: true })).toBeVisible();

  await bobMessages.getByText("Ship it?", { exact: true }).click({ button: "right" });
  await bobMessages.page().getByRole("menuitem", { exact: true, name: "Close" }).click();

  await expect(bobMessages.getByRole("button", { exact: true, name: "1 closed thread" })).toBeVisible();
  await expect(annMessages.getByRole("button", { exact: true, name: "1 closed thread" })).toBeVisible();
  await expect(annMessages.getByText("Ship it?", { exact: true })).toBeHidden();
});
