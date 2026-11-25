import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inSidebar, sidebarLink } from "./regions.ts";
import type { Page } from "@playwright/test";
import { logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

async function inboxShown(page: Page): Promise<void> {
  await expect(inPane(page).getByRole("heading", { exact: true, level: 1, name: "Inbox" })).toBeVisible();
  await expect(sidebarLink({ label: "Inbox", page })).toHaveAttribute("aria-current", "page");
}

test("the cookout name at the top left opens the inbox, as a real link", async ({ page }) => {
  const channel = unique("browser-home-link");
  await adminClient().createChannel({ name: channel });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInToChannels({ page, token, url: `/#/channels/${channel}` });

  await expect(inPane(page).getByRole("heading", { exact: true, level: 1, name: `#${channel}` })).toBeVisible();

  const home = inSidebar(page).getByRole("link", { exact: true, name: "cookout" });

  await expect(home).toHaveAttribute("href", "#/inbox");

  await home.click();

  await inboxShown(page);
});

test("/ and a hash no page has land on the inbox", async ({ page }) => {
  const { token } = await newIdentity({ kind: "human", name: unique("browser-home-land") });
  await logInToChannels({ page, token });

  await inboxShown(page);

  await page.goto("/#/nowhere");

  await inboxShown(page);
});

test("a link to a channel still opens that channel", async ({ page }) => {
  const channel = unique("browser-home-deep");
  await adminClient().createChannel({ name: channel });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInToChannels({ page, token, url: `/#/channels/${channel}` });

  await expect(inPane(page).getByRole("heading", { exact: true, level: 1, name: `#${channel}` })).toBeVisible();
  await expect(sidebarLink({ label: `#${channel}`, page })).toHaveAttribute("aria-current", "page");
});
