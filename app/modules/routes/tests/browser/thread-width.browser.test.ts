import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import type { Message } from "../../../sdk/index.ts";
import type { Page } from "@playwright/test";
import { logInToChannels } from "./login.ts";

const NARROW = { height: 900, width: 600 };
const WIDE = { height: 900, width: 1400 };
const DRAGGED = 120;
const NONE = 0;
const EDGE = "Resize the thread panel";
const HALF = 2;

async function threadOpen(page: Page, name: string): Promise<Message> {
  const { token } = await newIdentity({ kind: "human", name });
  await adminClient().createChannel({ name });
  const { message } = await adminClient().createMessage({ channel: name, text: "Resizable parent" });
  await page.setViewportSize(WIDE);
  await logInToChannels({ page, token });
  await page.goto(`/#/channels/${name}/threads/${String(message.id)}`);
  return message;
}

async function panelWidth(page: Page): Promise<number> {
  const box = await page.getByRole("complementary", { name: "Thread" }).boundingBox();
  if (box === null) {
    return NONE;
  }
  return box.width;
}

async function dragEdge(page: Page, by: number): Promise<void> {
  const box = await page.getByRole("separator", { name: EDGE }).boundingBox();
  if (box === null) {
    return;
  }
  const across = box.x + box.width / HALF;
  const down = box.y + box.height / HALF;
  await page.mouse.move(across, down);
  await page.mouse.down();
  await page.mouse.move(across - by, down, { steps: 5 });
  await page.mouse.up();
}

test("dragging the thread panel's edge left widens it, and a reload keeps the width", async ({ page }) => {
  await threadOpen(page, "browser-resize-panel");

  await expect(page.getByRole("separator", { name: EDGE })).toBeVisible();

  const before = await panelWidth(page);
  await dragEdge(page, DRAGGED);
  const after = await panelWidth(page);
  await page.reload();

  await expect(page.getByRole("separator", { name: EDGE })).toBeVisible();

  const reloaded = await panelWidth(page);

  expect([after - before, reloaded]).toStrictEqual([DRAGGED, after]);
});

test("dragging the thread panel's edge past its narrowest closes the thread", async ({ page }) => {
  const message = await threadOpen(page, "browser-resize-panel-close");

  await expect(page.getByRole("separator", { name: EDGE })).toBeVisible();

  await dragEdge(page, -WIDE.width);

  await expect(page.getByRole("complementary", { name: "Thread" })).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`#/channels/${message.channel}$`, "u"));
});

test("on a narrow screen the thread panel has no edge to drag", async ({ page }) => {
  await threadOpen(page, "browser-resize-panel-narrow");
  await page.setViewportSize(NARROW);

  await expect(page.getByRole("complementary", { name: "Thread" })).toContainText("Resizable parent");
  await expect(page.getByRole("separator", { name: EDGE })).toBeHidden();
});
