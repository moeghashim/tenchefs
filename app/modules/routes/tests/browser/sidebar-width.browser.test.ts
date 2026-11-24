import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { inSidebar, inTopBar } from "./regions.ts";
import { logInToChannels } from "./login.ts";

const NARROW = { height: 900, width: 600 };
const WIDE = { height: 900, width: 1400 };
const DRAGGED = 96;
const NONE = 0;
const EDGE = "Resize the sidebar";
const NARROWEST = 192;
const HALF = 2;

async function sidebarOpen(page: Page, name: string): Promise<void> {
  const { token } = await newIdentity({ kind: "human", name });
  await adminClient().createChannel({ name });
  await page.setViewportSize(WIDE);
  await logInToChannels({ page, token });
}

function edgeOf(page: Page): Locator {
  return inSidebar(page).getByRole("separator", { name: EDGE });
}

async function sidebarWidth(page: Page): Promise<number> {
  const box = await inSidebar(page).boundingBox();
  if (box === null) {
    return NONE;
  }
  return box.width;
}

async function dragEdge(page: Page, by: number): Promise<void> {
  const box = await edgeOf(page).boundingBox();
  if (box === null) {
    return;
  }
  const across = box.x + box.width / HALF;
  const down = box.y + box.height / HALF;
  await page.mouse.move(across, down);
  await page.mouse.down();
  await page.mouse.move(across + by, down, { steps: 5 });
  await page.mouse.up();
}

test("dragging the sidebar's edge right widens it, and a reload keeps the width", async ({ page }) => {
  await sidebarOpen(page, "browser-resize-sidebar");

  await expect(edgeOf(page)).toBeVisible();

  const before = await sidebarWidth(page);
  await dragEdge(page, DRAGGED);
  const after = await sidebarWidth(page);
  await page.reload();

  await expect(edgeOf(page)).toBeVisible();

  const reloaded = await sidebarWidth(page);

  expect([after - before, reloaded]).toStrictEqual([DRAGGED, after]);
});

test("dragging the sidebar's edge past its narrowest stops there, with the sidebar still shown", async ({ page }) => {
  await sidebarOpen(page, "browser-resize-sidebar-min");

  await expect(edgeOf(page)).toBeVisible();

  await dragEdge(page, -WIDE.width);

  await expect(inSidebar(page).getByRole("link", { name: /^Inbox/u })).toBeVisible();

  expect(await sidebarWidth(page)).toBe(NARROWEST);
});

test("on a narrow screen the sidebar has no edge to drag", async ({ page }) => {
  await sidebarOpen(page, "browser-resize-sidebar-narrow");
  await page.setViewportSize(NARROW);
  await inTopBar(page).getByRole("button", { name: "Open the sidebar" }).click();

  await expect(inSidebar(page).getByRole("link", { name: /^Inbox/u })).toBeVisible();
  await expect(edgeOf(page)).toBeHidden();
});
