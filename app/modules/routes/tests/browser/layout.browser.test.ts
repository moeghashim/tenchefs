import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { inSidebar, inThread, inTopBar, sidebarLink } from "./regions.ts";
import type { Message } from "../../../sdk/index.ts";
import type { Page } from "@playwright/test";
import { logInToChannels } from "./login.ts";
import { unique } from "./names.ts";

const NARROW = { height: 900, width: 600 };
const NONE = 0;

async function backgroundOf(page: Page): Promise<string> {
  const colour = await page.evaluate(() => globalThis.getComputedStyle(globalThis.document.body).backgroundColor);
  return colour;
}

async function themeChosen(page: Page, theme: string): Promise<string> {
  await inSidebar(page).getByRole("link", { exact: true, name: "Settings" }).click();
  await page.getByRole("region", { exact: true, name: "Settings" }).getByText(theme, { exact: true }).click();
  const colour = await backgroundOf(page);
  return colour;
}

async function reloaded(page: Page): Promise<string> {
  await page.reload();

  await expect(inSidebar(page)).toBeVisible();

  const colour = await backgroundOf(page);
  return colour;
}

async function narrowLogIn(page: Page): Promise<Message> {
  const { token } = await newIdentity({ kind: "human", name: unique("browser-narrow") });
  await adminClient().createChannel({ name: unique("browser-narrow") });
  const { message } = await adminClient().createMessage({ channel: unique("browser-narrow"), text: "Narrow parent" });
  await logInToChannels({ page, token });
  await page.setViewportSize(NARROW);
  return message;
}

async function widthOf(page: Page, name: string): Promise<number> {
  const box = await page.getByRole("complementary", { exact: true, name }).boundingBox();
  if (box === null) {
    return NONE;
  }
  return box.width;
}

test("on a narrow screen the sidebar hides behind a button, and the thread panel takes the whole width", async ({
  page,
}) => {
  const message = await narrowLogIn(page);

  await expect(inSidebar(page)).toBeHidden();

  await inTopBar(page).getByRole("button", { exact: true, name: "Open the sidebar" }).click();
  await sidebarLink({ label: `#${unique("browser-narrow")}`, page }).click();

  await expect(inSidebar(page)).toBeHidden();

  await page.goto(`/#/channels/${unique("browser-narrow")}/threads/${String(message.id)}`);

  await expect(page.getByRole("complementary", { exact: true, name: "Thread" })).toContainText("Narrow parent");
  await expect
    .poll(async () => {
      const width = await widthOf(page, "Thread");
      return width;
    })
    .toBe(NARROW.width);
});

const HALF = 2;

interface Point {
  readonly left: number;
  readonly top: number;
}

function avatarAt(point: Point): boolean {
  const hit = globalThis.document.elementFromPoint(point.left, point.top);
  if (hit === null) {
    return false;
  }
  return hit.closest("main [data-testid='replier-avatar']") !== null;
}

async function avatarOnTop(page: Page): Promise<boolean> {
  const box = await page.getByRole("main").getByTestId("replier-avatar").boundingBox();
  if (box === null) {
    return false;
  }
  const onTop = await page.evaluate(avatarAt, { left: box.x + box.width / HALF, top: box.y + box.height / HALF });
  return onTop;
}

test("on a narrow screen a reply's avatar in the channel stays under the thread panel and the open sidebar", async ({
  page,
}) => {
  const message = await narrowLogIn(page);
  await adminClient().createMessage({ channel: unique("browser-narrow"), replyTo: message.id, text: "Narrow reply" });
  await page.goto(`/#/channels/${unique("browser-narrow")}/threads/${String(message.id)}`);

  await expect(inThread(page)).toContainText("Narrow reply");
  await expect
    .poll(async () => {
      const onTop = await avatarOnTop(page);
      return onTop;
    })
    .toBe(false);

  await inTopBar(page).getByRole("button", { exact: true, name: "Open the sidebar" }).click();

  await expect(inSidebar(page)).toBeVisible();
  await expect
    .poll(async () => {
      const onTop = await avatarOnTop(page);
      return onTop;
    })
    .toBe(false);
});

test("the theme switch changes the theme at once, keeps it across a reload, and System follows the system", async ({
  page,
}) => {
  const { token } = await newIdentity({ kind: "human", name: unique("browser-theme") });
  await page.emulateMedia({ colorScheme: "dark" });
  await logInToChannels({ page, token });
  const systemDark = await backgroundOf(page);
  const light = await themeChosen(page, "Light");
  const afterReload = await reloaded(page);
  await themeChosen(page, "System");
  await page.emulateMedia({ colorScheme: "light" });

  expect([systemDark, light, afterReload, await backgroundOf(page)]).toStrictEqual([
    "rgb(10, 10, 10)",
    "rgb(255, 255, 255)",
    "rgb(255, 255, 255)",
    "rgb(255, 255, 255)",
  ]);
});
