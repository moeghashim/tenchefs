import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import type { Message } from "../../../sdk/index.ts";
import type { Page } from "@playwright/test";
import { inThread } from "./regions.ts";
import { logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const NARROW = { height: 900, width: 600 };
const WIDE = { height: 900, width: 1400 };
const ALONE = "Open thread on its own";
const BACK = "Back to channel";
const PARENT = "A thread worth reading alone";

async function threadOpen(page: Page, name: string): Promise<Message> {
  const { token } = await newIdentity({ kind: "human", name });
  await adminClient().createChannel({ name });
  const { message } = await adminClient().createMessage({ channel: name, text: PARENT });
  await page.setViewportSize(WIDE);
  await logInToChannels({ page, token });
  await page.goto(`/#/channels/${name}/threads/${String(message.id)}`);

  await expect(inThread(page)).toContainText(PARENT);

  return message;
}

function channelHeading(page: Page, channel: string): ReturnType<Page["getByRole"]> {
  return page.getByRole("heading", { exact: true, level: 1, name: `#${channel}` });
}

async function threadWidth(page: Page): Promise<number> {
  const box = await inThread(page).boundingBox();
  if (box === null) {
    throw new TypeError("The thread panel isn't drawn");
  }
  return box.width;
}

test("the thread panel's button shows the thread on its own, filling the space, with the sidebar kept and focus on its heading", async ({
  page,
}) => {
  const message = await threadOpen(page, unique("browser-thread-alone"));
  const before = await threadWidth(page);

  await inThread(page).getByRole("link", { exact: true, name: ALONE }).click();

  await expect(page).toHaveURL(new RegExp(`#/channels/${message.channel}/threads/${String(message.id)}/alone$`, "u"));
  await expect(channelHeading(page, message.channel)).toBeHidden();
  await expect(page.getByRole("navigation", { exact: true, name: "Sidebar" })).toBeVisible();
  await expect(inThread(page).getByRole("heading", { exact: true, level: 2, name: "Thread" })).toBeFocused();

  expect(await threadWidth(page)).toBeGreaterThan(before);
});

test("back to channel from the thread on its own shows both again, at the panel's width before", async ({ page }) => {
  const message = await threadOpen(page, unique("browser-thread-alone-back"));
  const before = await threadWidth(page);
  await inThread(page).getByRole("link", { exact: true, name: ALONE }).click();

  await expect(channelHeading(page, message.channel)).toBeHidden();

  await inThread(page).getByRole("link", { exact: true, name: BACK }).click();

  await expect(page).toHaveURL(new RegExp(`#/channels/${message.channel}/threads/${String(message.id)}$`, "u"));
  await expect(channelHeading(page, message.channel)).toBeVisible();
  await expect(inThread(page).getByRole("link", { exact: true, name: ALONE })).toBeVisible();

  expect(await threadWidth(page)).toBe(before);
});

test("close on the thread on its own closes the thread and shows the channel", async ({ page }) => {
  const message = await threadOpen(page, unique("browser-thread-alone-close"));
  await inThread(page).getByRole("link", { exact: true, name: ALONE }).click();

  await expect(channelHeading(page, message.channel)).toBeHidden();

  await inThread(page).getByRole("link", { exact: true, name: "Close panel" }).click();

  await expect(inThread(page)).toBeHidden();
  await expect(channelHeading(page, message.channel)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#/channels/${message.channel}$`, "u"));
});

test("a reload of the thread on its own opens it on its own, and replying there works as in the panel", async ({
  page,
}) => {
  const message = await threadOpen(page, unique("browser-thread-alone-reload"));
  await page.goto(`/#/channels/${message.channel}/threads/${String(message.id)}/alone`);
  await page.reload();

  await expect(inThread(page)).toContainText(PARENT);
  await expect(channelHeading(page, message.channel)).toBeHidden();

  const box = inThread(page).getByRole("textbox", { exact: true, name: "Reply" });
  await box.fill("Replied on its own");
  await box.press("Enter");

  await expect(inThread(page).getByRole("article").filter({ hasText: "Replied on its own" })).toBeVisible();
});

test("on a narrow screen the thread panel has no button to show it on its own", async ({ page }) => {
  await threadOpen(page, unique("browser-thread-alone-narrow"));
  await page.setViewportSize(NARROW);

  await expect(inThread(page)).toContainText(PARENT);
  await expect(inThread(page).getByRole("link", { exact: true, name: ALONE })).toBeHidden();
});
