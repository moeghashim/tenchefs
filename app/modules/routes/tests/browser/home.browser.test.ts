import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { inPane, inSidebar } from "./regions.ts";
import type { Page } from "@playwright/test";
import { logInToChannels } from "./login.ts";

async function inboxShown(page: Page): Promise<void> {
  await expect(inPane(page).getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
  await expect(inSidebar(page).getByRole("link", { name: /^Inbox/u })).toHaveAttribute("aria-current", "page");
}

test("the cookout name at the top left opens the inbox, as a real link", async ({ page }) => {
  const channel = "browser-home-link";
  await adminClient().createChannel({ name: channel });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInToChannels({ page, token, url: `/#/channels/${channel}` });

  await expect(inPane(page).getByRole("heading", { level: 1, name: `#${channel}` })).toBeVisible();

  const home = inSidebar(page).getByRole("link", { exact: true, name: "cookout" });

  await expect(home).toHaveAttribute("href", "#/inbox");

  await home.click();

  await inboxShown(page);
});

test("/ and a hash no page has land on the inbox", async ({ page }) => {
  const { token } = await newIdentity({ kind: "human", name: "browser-home-land" });
  await logInToChannels({ page, token });

  await inboxShown(page);

  await page.goto("/#/nowhere");

  await inboxShown(page);
});

test("a link to a channel still opens that channel", async ({ page }) => {
  const channel = "browser-home-deep";
  await adminClient().createChannel({ name: channel });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInToChannels({ page, token, url: `/#/channels/${channel}` });

  await expect(inPane(page).getByRole("heading", { level: 1, name: `#${channel}` })).toBeVisible();
  await expect(inSidebar(page).getByRole("link", { name: `#${channel}` })).toHaveAttribute("aria-current", "page");
});
