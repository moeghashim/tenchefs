import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { logInToChannels } from "./login.ts";

const FILLERS = 20;
const NONE = 0;
const TALL_DESCRIPTION = "Reads the mail\nSorts the post\nFiles the bills\nWaters the plants\nFeeds the cat";

interface Span {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

interface Edges {
  readonly card: Span;
  readonly name: Span;
}

async function spanOf(locator: Locator): Promise<Span> {
  const box = await locator.boundingBox();
  if (box === null) {
    return { bottom: NONE, left: NONE, right: NONE, top: NONE };
  }
  return { bottom: box.y + box.height, left: box.x, right: box.x + box.width, top: box.y };
}

async function postAs(channel: string, name: string, kind: "agent" | "human"): Promise<void> {
  const author = await newIdentity({ kind, name });
  if (kind === "agent") {
    await adminClient().setDescription(name, TALL_DESCRIPTION);
  }
  await author.client.createMessage({ channel, text: `A message from ${name}` });
}

async function openAsReader(page: Page, channel: string): Promise<void> {
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInToChannels({ page, token, url: `/#/channels/${channel}` });
}

async function cardTrigger(page: Page, name: string): Promise<Locator> {
  const trigger = page.getByRole("list", { name: "Messages" }).getByRole("link", { exact: true, name });

  await expect(trigger).toHaveAttribute("data-identity-card");
  await expect(trigger).toBeInViewport();

  return trigger;
}

async function edgesOnHover(page: Page, name: string): Promise<Edges> {
  const trigger = await cardTrigger(page, name);
  await trigger.hover();
  const card = page.getByRole("dialog");

  await expect(card).toBeVisible();

  return { card: await spanOf(card), name: await spanOf(trigger) };
}

test("a card for a name in the middle of the feed opens beside the name, to its right, so it covers no part of it", async ({
  page,
}) => {
  const channel = "browser-card-below";
  await adminClient().createChannel({ name: channel });
  await postAs(channel, `${channel}-first`, "human");
  await postAs(channel, `${channel}-middle`, "human");
  await postAs(channel, `${channel}-last`, "human");
  await openAsReader(page, channel);
  const edges = await edgesOnHover(page, `${channel}-middle`);

  expect([edges.card.left >= edges.name.right, edges.card.top <= edges.name.top]).toStrictEqual([true, true]);
});

test("the last message's card, with no room below it near the viewport's bottom, slides up to stay inside the window", async ({
  page,
}) => {
  const channel = "browser-card-flip";
  await adminClient().createChannel({ name: channel });
  await Promise.all(
    Array.from({ length: FILLERS }, async (_value, filler) => {
      await adminClient().createMessage({ channel, text: `Filler ${String(filler)}` });
    }),
  );
  await postAs(channel, `${channel}-bot`, "agent");
  await openAsReader(page, channel);
  const edges = await edgesOnHover(page, `${channel}-bot`);

  const height = await page.evaluate(() => globalThis.innerHeight);

  expect([edges.card.top < edges.name.top, edges.card.bottom <= height]).toStrictEqual([true, true]);
});

async function focusedAuthor(page: Page, channel: string): Promise<string> {
  const author = `${channel}-author`;
  await adminClient().createChannel({ name: channel });
  await postAs(channel, author, "human");
  await openAsReader(page, channel);
  const trigger = await cardTrigger(page, author);
  await trigger.focus();
  return author;
}

test("by keyboard alone, Tab from a focused name reaches the card's Message, and Enter on it puts @name in the message box", async ({
  page,
}) => {
  const author = await focusedAuthor(page, "browser-card-keys");

  await expect(page.getByRole("dialog")).toBeVisible();

  await page.keyboard.press("Tab");

  await expect(page.getByRole("dialog").getByRole("button", { name: "Message" })).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(page.getByRole("textbox", { name: "Message" })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue(`@${author} `);
});
