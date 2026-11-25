import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

async function openChannel(page: Page, channel: string): Promise<void> {
  await adminClient().createChannel({ name: channel });
  await adminClient().createMessage({ channel, text: "Hover over me" });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logIn({ page, token });
  await page.goto(`/#/channels/${channel}`);
}

test("hovering a thread in the channel shows its Close button, which closes the thread", async ({ page }) => {
  await openChannel(page, unique("browser-hover"));
  const message = page.getByRole("feed", { exact: true, name: "Messages" }).getByRole("article");
  const closeThread = message.getByRole("button", { exact: true, name: "Close thread" });

  await expect(closeThread).toBeHidden();

  await expect(async () => {
    await message.hover();

    await expect(closeThread).toBeVisible({ timeout: 1000 });
  }).toPass();

  await expect(closeThread).toHaveText("");
  await expect(message.getByRole("link", { exact: true, name: "Reply" })).toBeVisible();

  await closeThread.click();

  await expect(inPane(page).getByRole("button", { exact: true, name: "1 closed thread" })).toBeVisible();
});

test("tabbing to a thread in the channel shows its Close button", async ({ page }) => {
  await openChannel(page, unique("browser-tab"));
  const message = page.getByRole("feed", { exact: true, name: "Messages" }).getByRole("article");
  const closeThread = message.getByRole("button", { exact: true, name: "Close thread" });

  await expect(closeThread).toBeHidden();

  await message.focus();

  await expect(closeThread).toBeVisible();
});

test("a channel message's hover bar has Reply and no Open thread, and Reply opens the thread with the reply box focused", async ({
  page,
}) => {
  await openChannel(page, unique("browser-hover-no-open"));
  const message = page.getByRole("feed", { exact: true, name: "Messages" }).getByRole("article");
  const bar = message.getByRole("group", { exact: true, name: "Quick actions" });
  const reply = bar.getByRole("link", { exact: true, name: "Reply" });

  await expect(async () => {
    await message.hover();

    await expect(reply).toBeVisible({ timeout: 1000 });
  }).toPass();

  await expect(bar.getByRole("link", { exact: true, name: "Open thread" })).not.toBeAttached();

  await reply.click();

  await expect(page.getByRole("textbox", { exact: true, name: "Reply" })).toBeFocused();
});

test("Reply in a thread's More actions menu opens the thread with the cursor in the reply box", async ({ page }) => {
  await openChannel(page, unique("browser-hover-reply"));
  const message = page.getByRole("feed", { exact: true, name: "Messages" }).getByRole("article");
  await message.hover();
  await message.getByRole("button", { exact: true, name: "More actions" }).click();
  await page.getByRole("menuitem", { exact: true, name: "Reply" }).click();

  await expect(page.getByRole("textbox", { exact: true, name: "Reply" })).toBeFocused();
});

interface Shot {
  readonly page: Page;
  readonly theme: "dark" | "light";
}

async function hoverBarIn({ page, theme }: Shot): Promise<void> {
  await page.evaluate((chosen) => {
    globalThis.localStorage.setItem("cookout-theme", chosen);
  }, theme);
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

  const message = page.getByRole("feed", { exact: true, name: "Messages" }).getByRole("article");
  const bar = message.getByRole("group", { exact: true, name: "Quick actions" });

  await expect(async () => {
    await message.hover();

    await expect(bar).toBeVisible({ timeout: 1000 });
  }).toPass();

  await expect(bar.getByRole("button", { exact: true, name: "React with 👎" })).toBeHidden();

  await message.screenshot({ path: test.info().outputPath(`hover-bar-${theme}.png`) });
}

test("a channel message's hover bar draws 👍, Reply, Close thread and More actions as icons in both themes", async ({
  page,
}) => {
  await openChannel(page, unique("browser-hover-bar"));
  await hoverBarIn({ page, theme: "dark" });
  await hoverBarIn({ page, theme: "light" });
});
