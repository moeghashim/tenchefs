import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

const NONE = 0;
const NEXT = 1;
const NOTHING: readonly Locator[] = [];

interface Step {
  readonly keys: string;
  readonly focused: Locator;
  readonly typed?: true;
  readonly shows?: readonly Locator[];
  readonly gone?: readonly Locator[];
}

interface Walking {
  readonly page: Page;
  readonly steps: readonly Step[];
}

interface Copied {
  readonly page: Page;
  readonly text: string;
}

async function keysOf(page: Page, step: Step): Promise<void> {
  if (step.typed === true) {
    await page.keyboard.type(step.keys);
    return;
  }
  await page.keyboard.press(step.keys);
}

async function taken(page: Page, step: Step): Promise<void> {
  await keysOf(page, step);

  await expect(step.focused).toBeFocused();

  await Promise.all([
    ...(step.shows ?? NOTHING).map(async (shown) => {
      await expect(shown).toBeVisible();
    }),
    ...(step.gone ?? NOTHING).map(async (gone) => {
      await expect(gone).toHaveCount(NONE);
    }),
  ]);
}

async function walk({ page, steps }: Walking): Promise<void> {
  const [first, rest] = [steps.slice(NONE, NEXT), steps.slice(NEXT)];
  await Promise.all(
    first.map(async (step) => {
      await taken(page, step);
    }),
  );
  if (rest.length > NONE) {
    await walk({ page, steps: rest });
  }
}

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

function copied({ page, text }: Copied): Locator {
  return page.locator(`html[data-copied="${text}"]`);
}

function tokenCopied(page: Page): Locator {
  return page.locator('html[data-copied^="cookout_"]');
}

export { type Step, copied, copiesRecorded, tokenCopied, walk };
