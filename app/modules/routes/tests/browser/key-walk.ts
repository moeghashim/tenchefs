import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { inPane } from "./regions.ts";

const ANNOUNCEMENTS = { exact: true, name: "Announcements" } as const;
const MESSAGES = { exact: true, name: "Messages" } as const;
const SHOWN = 200;
const START = 0;

type Check = () => Promise<void>;

type Step = Check | readonly [key: string, focused: Locator];

interface Walk {
  readonly page: Page;
  readonly steps: readonly Step[];
}

interface Typing {
  readonly page: Page;
  readonly text: string;
  readonly into: Locator;
  readonly after?: Locator;
}

interface Text {
  readonly page: Page;
  readonly text: string;
}

async function focusNow(page: Page): Promise<string> {
  const html = await page.evaluate(
    ([start, end]) => {
      const { activeElement } = globalThis.document;
      if (activeElement === null) {
        return "nothing";
      }
      return activeElement.outerHTML.slice(start, end);
    },
    [START, SHOWN] as const,
  );
  return html;
}

async function pressed(page: Page, [key, focused]: readonly [string, Locator]): Promise<void> {
  await page.keyboard.press(key);
  try {
    await expect(focused, `after ${key}`).toBeFocused();
  } catch (error: unknown) {
    throw new Error(`after ${key}, focus is on ${await focusNow(page)}`, { cause: error });
  }
}

async function stepped(page: Page, step: Step): Promise<void> {
  if (typeof step === "function") {
    await step();
    return;
  }
  await pressed(page, step);
}

async function walk({ page, steps }: Walk): Promise<void> {
  const [step, ...rest] = steps;
  if (typeof step !== "function" && typeof step !== "object") {
    return;
  }
  await stepped(page, step);
  await walk({ page, steps: rest });
}

function typing({ after, into, page, text }: Typing): Check {
  return async () => {
    await expect(into).toBeFocused();

    await page.keyboard.type(text);

    await expect(after ?? into).toBeFocused();
  };
}

function said({ page, text }: Text): Locator {
  return page.getByRole("status", ANNOUNCEMENTS).filter({ hasText: text });
}

function feedMessage({ page, text }: Text): Locator {
  return inPane(page).getByRole("feed", MESSAGES).getByRole("article").filter({ hasText: text });
}

function shown(locator: Locator): Check {
  return async () => {
    await expect(locator).toBeVisible();
  };
}

function hidden(locator: Locator): Check {
  return async () => {
    await expect(locator).toBeHidden();
  };
}

function announced(text: Text): Check {
  return async () => {
    await expect(said(text)).toBeAttached();
  };
}

export { type Step, announced, feedMessage, hidden, said, shown, typing, walk };
