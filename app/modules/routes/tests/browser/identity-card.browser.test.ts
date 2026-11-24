import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { logInToChannels } from "./login.ts";

const FILLERS = 20;
const NONE = 0;
const TALL_DESCRIPTION = "Reads the mail\nSorts the post\nFiles the bills\nWaters the plants\nFeeds the cat";

interface Span {
  readonly bottom: number;
  readonly top: number;
}

interface Edges {
  readonly card: Span;
  readonly name: Span;
}

async function spanOf(locator: Locator): Promise<Span> {
  const box = await locator.boundingBox();
  if (box === null) {
    return { bottom: NONE, top: NONE };
  }
  return { bottom: box.y + box.height, top: box.y };
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

async function edgesOnHover(page: Page, name: string): Promise<Edges> {
  const trigger = page.getByRole("list", { name: "Messages" }).getByRole("link", { exact: true, name });
  await trigger.hover();
  const card = page.getByRole("tooltip");

  await expect(card).toBeVisible();

  return { card: await spanOf(card), name: await spanOf(trigger) };
}

test("a card for a name in the middle of the feed opens below the name, so it covers only that message", async ({
  page,
}) => {
  const channel = "browser-card-below";
  await adminClient().createChannel({ name: channel });
  await postAs(channel, `${channel}-first`, "human");
  await postAs(channel, `${channel}-middle`, "human");
  await postAs(channel, `${channel}-last`, "human");
  await openAsReader(page, channel);
  const edges = await edgesOnHover(page, `${channel}-middle`);

  expect(edges.card.top).toBeGreaterThanOrEqual(edges.name.bottom);
});

test("the last message's card, with no room below it near the viewport's bottom, flips above the name", async ({
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

  expect(edges.card.bottom).toBeLessThanOrEqual(edges.name.top);
});
