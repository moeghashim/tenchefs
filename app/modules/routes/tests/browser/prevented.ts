import type { Page } from "@playwright/test";

interface Chord {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
}

export interface Pressing extends Chord {
  readonly page: Page;
}

export async function pressedPrevented({ page, ...chord }: Pressing): Promise<boolean> {
  const notPrevented = await page.evaluate(
    (pressed: Chord) =>
      (globalThis.document.activeElement ?? globalThis.document.body).dispatchEvent(
        new KeyboardEvent("keydown", { ...pressed, bubbles: true, cancelable: true }),
      ),
    chord,
  );
  return !notPrevented;
}
