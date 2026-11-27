import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inDialog, inProfile } from "./regions.ts";
import { createTestAgent } from "../../../testing/index.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

test.use({ viewport: { height: 600, width: 1280 } });

const FIELD = "Transfer to (a human's name)";
const MOST_TABS = 40;
const ONE = 1;
const NONE = 0;

interface Opened {
  readonly bot: string;
  readonly heir: string;
}

interface Tabbing {
  readonly page: Page;
  readonly target: Locator;
  readonly left: number;
}

async function agentOf(prefix: string): Promise<Opened & { readonly token: string }> {
  const viewer = `${prefix}-viewer`;
  const me = await newIdentity({ kind: "human", name: viewer });
  await adminClient().makeAdmin(viewer);
  const opened = { bot: `${prefix}-bot`, heir: `${prefix}-heir` };
  await newIdentity({ kind: "human", name: opened.heir });
  await createTestAgent({ by: me.client, name: opened.bot });
  await me.client.join({ as: opened.bot });
  return { ...opened, token: me.token };
}

async function agentProfileOpen(page: Page): Promise<Opened> {
  const { bot, heir, token } = await agentOf(unique("browser-profile-scroll"));
  await logIn({ page, token, url: `/#/people/${bot}` });

  await expect(inProfile(page).getByRole("button", { exact: true, name: "Revoke session" })).toBeAttached();

  return { bot, heir };
}

function header(page: Page): Locator {
  return inProfile(page).getByRole("heading", { level: 3 });
}

function transferField(page: Page): Locator {
  return inProfile(page).getByRole("textbox", { exact: true, name: FIELD });
}

async function documentScrolls(page: Page): Promise<boolean> {
  const scrolls = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return root.scrollHeight > root.clientHeight;
  });
  return scrolls;
}

async function tabTo({ left, page, target }: Tabbing): Promise<void> {
  const reached = await target.evaluate((element: object) => element === document.activeElement);
  if (reached || left === NONE) {
    return;
  }
  await page.keyboard.press("Tab");
  await tabTo({ left: left - ONE, page, target });
}

async function headerShown(page: Page, bot: string): Promise<void> {
  await expect(header(page)).toBeInViewport({ ratio: 1 });
  await expect(header(page)).toContainText(bot);
  expect(await documentScrolls(page)).toBe(false);
}

test("on a short window an agent's profile scrolls its sections under a header that stays put, and the page itself never scrolls", async ({
  page,
}) => {
  const { bot, heir } = await agentProfileOpen(page);
  const transfer = inProfile(page).getByRole("button", { exact: true, name: "Transfer" });

  await expect(transfer).not.toBeInViewport();

  await transferField(page).fill(heir);

  await transfer.scrollIntoViewIfNeeded();

  await expect(transfer).toBeInViewport({ ratio: 1 });

  await headerShown(page, bot);
  await transfer.click();

  await expect(inDialog(page).getByRole("button", { exact: true, name: `Transfer to @${heir}` })).toBeVisible();
});

test("on a short window tabbing to a field below the fold of an agent's profile brings it into view", async ({
  page,
}) => {
  const { bot } = await agentProfileOpen(page);
  const field = transferField(page);

  await expect(field).not.toBeInViewport();

  await inProfile(page).getByRole("textbox", { exact: true, name: "Display name" }).focus();

  await tabTo({ left: MOST_TABS, page, target: field });

  await expect(field).toBeFocused();
  await expect(field).toBeInViewport({ ratio: 1 });

  await headerShown(page, bot);
});
