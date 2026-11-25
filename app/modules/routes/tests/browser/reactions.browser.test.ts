import type { Browser, Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

function channelName(): string {
  return unique("browser-reactions");
}

function annName(): string {
  return `${channelName()}-ann`;
}

function bobName(): string {
  return `${channelName()}-bob`;
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

function messageOn(page: Page): Locator {
  return inPane(page).getByRole("feed", { exact: true, name: "Messages" }).getByRole("article");
}

async function posted(): Promise<Tokens> {
  await adminClient().createChannel({ name: channelName() });
  const author = await newIdentity({ kind: "human", name: annName() });
  const reactor = await newIdentity({ kind: "human", name: bobName() });
  await author.client.createMessage({ channel: channelName(), text: "Ship it?" });
  return { ann: author.token, bob: reactor.token };
}

test("a 👍 left from the hover actions in one tab shows as a chip in another, and its click there adds a second", async ({
  browser,
}) => {
  const tokens = await posted();
  const annPage = await openAs({ browser, token: tokens.ann });
  const bobMessage = messageOn(await openAs({ browser, token: tokens.bob }));
  await bobMessage.hover();
  await bobMessage.getByRole("button", { exact: true, name: "React with 👍" }).click();

  await expect(bobMessage.getByRole("button", { exact: true, name: "👍 1", pressed: true })).toBeVisible();

  const annChip = messageOn(annPage).getByRole("button", { exact: true, name: "👍 1", pressed: false });

  await expect(annChip).toHaveAttribute("title", bobName());

  await annChip.click();

  await expect(bobMessage.getByRole("button", { exact: true, name: "👍 2", pressed: true })).toHaveAttribute(
    "title",
    `${bobName()}, ${annName()}`,
  );
});
