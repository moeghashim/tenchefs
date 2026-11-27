import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const MARKDOWN = "**Ship it** with `pnpm check`, see [the spec](https://example.com/spec).";
const SHOWN = "Ship it";
const RIGHT_BUTTON = 2;
const NONE = 0;
const ANNOUNCEMENTS = { exact: true, name: "Announcements" } as const;
const MENU = { exact: true, name: "Message actions" } as const;
const COPY_TEXT = { exact: true, name: "Copy text" } as const;

async function copiesRecorded(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "clipboard", {
      get: (): Pick<Clipboard, "writeText"> => ({
        writeText: async (text: string): Promise<void> => {
          globalThis.document.documentElement.dataset["copied"] = text;
          await Promise.resolve();
        },
      }),
    });
  });
}

async function contextMenusRecorded(page: Page): Promise<void> {
  await page.addInitScript(() => {
    globalThis.addEventListener(
      "contextmenu",
      (event: unknown) => {
        Reflect.set(globalThis, "contextMenuEvent", event);
      },
      { capture: true },
    );
  });
}

function browserMenuShown(page: Page): () => Promise<string> {
  return async () => {
    const shown = await page.evaluate(() => {
      const event: unknown = Reflect.get(globalThis, "contextMenuEvent");
      if (!(event instanceof Event)) {
        return "no right-click";
      }
      return String(!event.defaultPrevented);
    });
    return shown;
  };
}

function shownText(message: Locator): Locator {
  return message.getByText(SHOWN, { exact: true });
}

async function openChannel(page: Page, channel: string): Promise<Locator> {
  await adminClient().createChannel({ name: channel });
  await adminClient().createMessage({ channel, text: MARKDOWN });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logIn({ page, token });
  await page.goto(`/#/channels/${channel}`);
  const message = inPane(page).getByRole("feed", { exact: true, name: "Messages" }).getByRole("article");

  await expect(shownText(message)).toBeVisible();

  return message;
}

function said(page: Page, text: string): Locator {
  return page.getByRole("status", ANNOUNCEMENTS).filter({ hasText: text });
}

async function selectedText(message: Locator): Promise<void> {
  await shownText(message).evaluate((element: unknown) => {
    const selection = globalThis.getSelection();
    if (selection === null || !(element instanceof Node)) {
      return;
    }
    const range = globalThis.document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

async function wordSelectedOnPress(page: Page): Promise<void> {
  await page.evaluate((button: number) => {
    globalThis.document.addEventListener("mousedown", (event: unknown) => {
      const selection = globalThis.getSelection();
      if (!(event instanceof MouseEvent) || event.button !== button || !(event.target instanceof Node)) {
        return;
      }
      if (selection === null) {
        return;
      }
      const range = globalThis.document.createRange();
      range.selectNodeContents(event.target);
      selection.removeAllRanges();
      selection.addRange(range);
    });
  }, RIGHT_BUTTON);
}

test("right-clicking a message and choosing Copy text copies its Markdown and says so", async ({ page }) => {
  await copiesRecorded(page);
  const message = await openChannel(page, unique("browser-copy-text-menu"));

  await shownText(message).click({ button: "right" });
  await page.getByRole("menu", MENU).getByRole("menuitem", COPY_TEXT).click();

  await expect(page.locator("html")).toHaveAttribute("data-copied", MARKDOWN);
  await expect(said(page, "Text copied")).toBeAttached();
});

test("c on a focused message copies its Markdown", async ({ page }) => {
  await copiesRecorded(page);
  const message = await openChannel(page, unique("browser-copy-text-key"));
  await message.focus();

  await page.keyboard.press("c");

  await expect(page.locator("html")).toHaveAttribute("data-copied", MARKDOWN);
  await expect(said(page, "Text copied")).toBeAttached();
});

test("right-clicking a message with text selected in it keeps the browser's menu", async ({ page }) => {
  await contextMenusRecorded(page);
  const message = await openChannel(page, unique("browser-copy-text-selected"));
  await selectedText(message);

  await shownText(message).click({ button: "right" });

  await expect.poll(browserMenuShown(page)).toBe("true");
  await expect(page.getByRole("menu", MENU)).toHaveCount(NONE);
});

test("a right-click that selects the word under the pointer, as macOS does, still opens the message's menu", async ({
  page,
}) => {
  await contextMenusRecorded(page);
  const message = await openChannel(page, unique("browser-copy-text-word"));
  await wordSelectedOnPress(page);

  await shownText(message).click({ button: "right" });

  await expect(page.getByRole("menu", MENU).getByRole("menuitem", COPY_TEXT)).toBeVisible();
  await expect.poll(browserMenuShown(page)).toBe("false");
});
