import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { logIn } from "./login.ts";

const NEAR = 4;
const INSET = 40;
const EDGE = 3;
const CORNER = 0;

interface Point {
  readonly left: number;
  readonly top: number;
}

interface Corners {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

async function openChannel(page: Page, channel: string): Promise<Locator> {
  await adminClient().createChannel({ name: channel });
  await adminClient().createMessage({ channel, text: "Right-click me" });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logIn({ page, token });
  await page.goto(`/#/channels/${channel}`);
  const message = page.getByRole("list", { name: "Messages" }).getByRole("article");

  await expect(message).toBeVisible();

  await message.hover();

  return message;
}

async function boxOf(locator: Locator): Promise<Corners> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("Not shown");
  }
  return { bottom: box.y + box.height, left: box.x, right: box.x + box.width, top: box.y };
}

async function menuAt(page: Page, point: Point): Promise<Corners> {
  await page.mouse.click(point.left, point.top, { button: "right" });
  const menu = page.getByRole("menu", { name: "Message actions" });

  await expect(menu.getByRole("menuitem", { name: "Mark unread" })).toBeVisible();

  return boxOf(menu);
}

function widthOf(page: Page): number {
  const size = page.viewportSize();
  if (size === null) {
    throw new Error("No viewport");
  }
  return size.width;
}

function near(shown: number, wanted: number): boolean {
  return Math.abs(shown - wanted) <= NEAR;
}

test("right-clicking a message opens its actions menu at the pointer", async ({ page }) => {
  const message = await openChannel(page, "browser-menu-at");
  const article = await boxOf(message);
  const point = { left: article.left + INSET, top: article.top + EDGE };
  const menu = await menuAt(page, point);

  expect([near(menu.left, point.left), near(menu.top, point.top)]).toStrictEqual([true, true]);
});

test("right-clicking a message by the window's right edge opens its menu leftwards from the pointer, inside the window", async ({
  page,
}) => {
  const message = await openChannel(page, "browser-menu-edge");
  const article = await boxOf(message);
  const point = { left: article.right - EDGE, top: article.top + EDGE };
  const menu = await menuAt(page, point);
  const width = widthOf(page);

  expect([near(menu.right, point.left), near(menu.top, point.top), menu.right <= width]).toStrictEqual([
    true,
    true,
    true,
  ]);
});

test("the More actions menu takes focus, moves with the arrow keys and gives focus back on Escape", async ({
  page,
}) => {
  const message = await openChannel(page, "browser-menu-keys");
  await message.focus();
  const more = message.getByRole("button", { name: "More actions" });
  await more.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("menuitem", { name: "Reply" })).toBeFocused();

  await page.keyboard.press("ArrowDown");

  await expect(page.getByRole("menuitem", { name: "React with 👍" })).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(more).toBeFocused();
});

test("the More actions button stays shown while its menu is open, so Escape can give focus back to it", async ({
  page,
}) => {
  const message = await openChannel(page, "browser-menu-shown");
  await message.getByRole("button", { name: "More actions" }).focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("menuitem", { name: "Reply" })).toBeFocused();
  await expect(
    page.getByRole("main", { includeHidden: true }).getByRole("button", { includeHidden: true, name: "More actions" }),
  ).toBeVisible();
});

test("Escape in the More actions menu gives focus back to its button with the mouse away from the message", async ({
  page,
}) => {
  const message = await openChannel(page, "browser-menu-unhovered");
  await page.mouse.move(CORNER, CORNER);
  await message.focus();
  const more = message.getByRole("button", { name: "More actions" });
  await more.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("menuitem", { name: "Reply" })).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(more).toBeFocused();
});
