import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inThread } from "./regions.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

interface Opened {
  readonly page: Page;
  readonly channel: string;
}

async function openThread({ channel, page }: Opened): Promise<void> {
  const poster = await newIdentity({ kind: "human", name: `${channel}-ada` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-grace` });
  await adminClient().createChannel({ name: channel });
  const { message: parent } = await poster.client.createMessage({ channel, text: "Deploy?" });
  await poster.client.createMessage({ channel, replyTo: parent.id, text: "Noon works" });
  await reader.client.createMessage({ channel, replyTo: parent.id, text: "Or one" });
  await logIn({ page, token: reader.token });
  await page.goto(`/#/channels/${channel}/threads/${String(parent.id)}`);
}

function replyNamed(page: Page, text: string): Locator {
  return inThread(page)
    .getByRole("feed", { exact: true, name: "Replies" })
    .getByRole("article")
    .filter({ hasText: text });
}

async function hoverReply(message: Locator): Promise<void> {
  const reply = message
    .getByRole("group", { exact: true, name: "Quick actions" })
    .getByRole("button", { exact: true, name: "Reply" });

  await expect(async () => {
    await message.hover();

    await expect(reply).toBeVisible({ timeout: 1000 });
  }).toPass();

  await reply.click();
}

test("a thread reply's hover Reply mentions its author once, keeping the draft", async ({ page }) => {
  const channel = unique("browser-panel-hover-reply");
  await openThread({ channel, page });
  const box = inThread(page).getByRole("textbox", { exact: true, name: "Reply" });
  await box.fill("works for me");
  await hoverReply(replyNamed(page, "Noon works"));

  await expect(box).toBeFocused();
  await expect(box).toHaveValue(`@${channel}-ada works for me`);

  await hoverReply(replyNamed(page, "Noon works"));

  await expect(box).toHaveValue(`@${channel}-ada works for me`);
});

test("hover Reply on your own thread reply mentions nobody and focuses the reply box", async ({ page }) => {
  await openThread({ channel: unique("browser-panel-hover-own"), page });
  const box = inThread(page).getByRole("textbox", { exact: true, name: "Reply" });
  await hoverReply(replyNamed(page, "Or one"));

  await expect(box).toBeFocused();
  await expect(box).toHaveValue("");
});

test("tabbing to a thread reply shows its hover Reply", async ({ page }) => {
  await openThread({ channel: unique("browser-panel-hover-tab"), page });
  const message = replyNamed(page, "Noon works");
  const reply = message.getByRole("button", { exact: true, name: "Reply" });

  await expect(reply).toBeHidden();

  await message.focus();

  await expect(reply).toBeVisible();
});

interface Shot {
  readonly page: Page;
  readonly theme: "dark" | "light";
}

async function threadHoverBarIn({ page, theme }: Shot): Promise<void> {
  await page.evaluate((chosen) => {
    globalThis.localStorage.setItem("cookout-theme", chosen);
  }, theme);
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

  const message = replyNamed(page, "Noon works");
  const bar = message.getByRole("group", { exact: true, name: "Quick actions" });

  await expect(async () => {
    await message.hover();

    await expect(bar.getByRole("button", { exact: true, name: "Reply" })).toBeVisible({ timeout: 1000 });
  }).toPass();

  await message.screenshot({ path: test.info().outputPath(`thread-hover-bar-${theme}.png`) });
}

test("a thread reply's hover bar draws 👍, Reply and More actions in both themes", async ({ page }) => {
  await openThread({ channel: unique("browser-panel-hover-bar"), page });
  await threadHoverBarIn({ page, theme: "dark" });
  await threadHoverBarIn({ page, theme: "light" });
});
