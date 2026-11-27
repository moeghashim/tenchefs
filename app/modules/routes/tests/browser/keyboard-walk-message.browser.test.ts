import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { feedMessage, hidden, shown, walk } from "./key-walk.ts";
import { inPane, inSidebar } from "./regions.ts";
import type { CookoutClient } from "../../../sdk/index.ts";
import type { Page } from "@playwright/test";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { testAgentDisplayName } from "../../../testing/index.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const OLDER = 51;
const NONE = 0;
const ONE = 1;
const PAD = 2;
const WITH_DATA = "With data.";
const MESSAGES = { exact: true, name: "Messages" } as const;

interface Filling {
  readonly channel: string;
  readonly client: CookoutClient;
}

async function filled({ channel, client }: Filling, left: number): Promise<void> {
  if (left < ONE) {
    return;
  }
  await filled({ channel, client }, left - ONE);
  await client.createMessage({ channel, text: `Filler ${String(left).padStart(PAD, "0")}.` });
}

async function posted({ channel, client }: Filling): Promise<void> {
  await filled({ channel, client: adminClient() }, OLDER);
  await client.createMessage({ channel, data: { status: "green" }, text: WITH_DATA });
  await adminClient().createMessage({ channel, text: "The newest." });
}

async function opened(page: Page): Promise<string> {
  const channel = unique("kbwalk-message");
  await adminClient().createChannel({ name: channel });
  const { client } = await newIdentity({ kind: "agent", name: `${channel}-poster` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await reader.client.subscribe(channel);
  await posted({ channel, client });
  await logInWithStream({ page, token: reader.token, url: `/#/channels/${channel}` });
  await walk({
    page,
    steps: [
      shown(feedMessage({ page, text: "The newest." })),
      ["Tab", inSidebar(page).getByRole("button", { exact: true, name: "Collapse sidebar" })],
      ["Control+]", feedMessage({ page, text: "The newest." })],
    ],
  });
  return `${channel}-poster`;
}

test("a message's author card, author menu, time tooltip and data work by keys alone", async ({ page }) => {
  const poster = await opened(page);
  const data = feedMessage({ page, text: WITH_DATA });
  const author = data.getByRole("link", { exact: true, name: testAgentDisplayName(poster) });
  const card = page.getByRole("dialog", { exact: true, name: testAgentDisplayName(poster) });
  const menuButton = data.getByRole("button", { exact: true, name: `@${poster} actions` });
  const menu = page.getByRole("menu", { exact: true, name: `@${poster} actions` });
  const toggle = data.locator("summary");
  await walk({
    page,
    steps: [
      ["k", data],
      ["Tab", author],
      shown(card),
      ["Tab", card.getByRole("button", { exact: true, name: "Message" })],
      ["Tab", card.getByRole("link", { exact: true, name: "View profile" })],
      ["Escape", author],
      hidden(card),
      ["Tab", menuButton],
      ["Enter", menu.getByRole("menuitem").first()],
      ["Escape", menuButton],
      ["Tab", data.locator("time")],
      shown(page.getByRole("tooltip")),
      ["Escape", data.locator("time")],
      hidden(page.getByRole("tooltip")),
      ["Tab", toggle],
      ["Enter", toggle],
      async (): Promise<void> => {
        await expect(data.locator("details")).toContainText('"status": "green"');
      },
      ["Escape", toggle],
    ],
  });

  await expect(menu).toBeHidden();
});

test("home, then k past the oldest loaded message, loads older ones with focus kept on a message", async ({ page }) => {
  await opened(page);
  const messages = inPane(page).getByRole("feed", MESSAGES).getByRole("article");
  await walk({ page, steps: [["Home", messages.first()]] });

  await expect(feedMessage({ page, text: "Filler 01." })).toHaveCount(NONE);

  await page.keyboard.press("k");

  await expect(feedMessage({ page, text: "Filler 01." })).toBeVisible();
  await expect(messages.and(page.locator(":focus"))).toHaveCount(ONE);
});
