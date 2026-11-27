import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { inThread } from "./regions.ts";
import { logInToChannels } from "./login.ts";
import { unique } from "./names.ts";

const WIDE = { height: 900, width: 1400 };
const TITLE_LENGTH = 100;
const ONE_LINE = 1;
const LONG_TITLE = "A thread title long enough to run past the panel's header and keep going until it is cut ".padEnd(
  TITLE_LENGTH,
  "x",
);

interface HeadingFit {
  readonly lines: number;
  readonly truncated: boolean;
  readonly size: string;
  readonly weight: string;
}

interface MetaLook {
  readonly size: string;
  readonly font: string;
}

const HEADING = 'aside[aria-label="Thread"] header h2';
const META = `${HEADING} + p`;

async function headingFitOf(page: Page): Promise<HeadingFit> {
  const fit = await page.evaluate((selector: string) => {
    const heading = globalThis.document.querySelector(selector);
    if (heading === null) {
      return { lines: 0, size: "", truncated: false, weight: "" };
    }
    const range = globalThis.document.createRange();
    range.selectNodeContents(heading);
    const tops = new Set<number>();
    for (const rect of range.getClientRects()) {
      tops.add(Math.round(rect.top));
    }
    const style = globalThis.getComputedStyle(heading);
    return {
      lines: tops.size,
      size: style.fontSize,
      truncated: heading.scrollWidth > heading.clientWidth,
      weight: style.fontWeight,
    };
  }, HEADING);
  return fit;
}

async function metaLookOf(page: Page): Promise<MetaLook> {
  const look = await page.evaluate((selector: string) => {
    const meta = globalThis.document.querySelector(selector);
    if (meta === null) {
      return { font: "", size: "" };
    }
    const style = globalThis.getComputedStyle(meta);
    return { font: style.fontFamily, size: style.fontSize };
  }, META);
  return look;
}

async function titledThreadOpen(page: Page): Promise<string> {
  const name = unique("browser-thread-title");
  const { token } = await newIdentity({ kind: "human", name });
  await adminClient().createChannel({ name });
  const { message } = await adminClient().createMessage({ channel: name, text: "A titled thread" });
  await adminClient().setThreadTitle(message.id, LONG_TITLE);
  await page.setViewportSize(WIDE);
  await logInToChannels({ page, token });
  await page.goto(`/#/channels/${name}/threads/${String(message.id)}`);
  return name;
}

test("a 100-character thread title stays on one line in the panel's header, truncated, over a small mono line", async ({
  page,
}) => {
  const name = await titledThreadOpen(page);
  const heading = inThread(page).getByRole("heading", { exact: true, level: 2, name: LONG_TITLE });
  const meta = inThread(page).getByText(`Thread · #${name}`, { exact: true });

  await expect(heading).toBeVisible();
  await expect(meta).toBeVisible();
  await expect(inThread(page).getByRole("link", { exact: true, name: "Close panel" })).toBeInViewport({ ratio: 1 });

  expect(await headingFitOf(page)).toStrictEqual({ lines: ONE_LINE, size: "15px", truncated: true, weight: "600" });
  expect(await metaLookOf(page)).toStrictEqual({ font: expect.stringContaining("Mono"), size: "11px" });
});

async function untitledThreadOpen(page: Page): Promise<void> {
  const name = unique("browser-thread-add-title");
  const { token } = await newIdentity({ kind: "human", name });
  await adminClient().createChannel({ name });
  const { message } = await adminClient().createMessage({ channel: name, text: "An untitled thread" });
  await page.setViewportSize(WIDE);
  await logInToChannels({ page, token });
  await page.goto(`/#/channels/${name}/threads/${String(message.id)}`);
}

async function typedAndPressed(page: Page, text: string, key: string): Promise<void> {
  const box = inThread(page).getByRole("textbox", { exact: true, name: "Title" });

  await expect(box).toBeFocused();

  await box.fill(text);
  await box.press(key);
}

test("Add title, typing and Enter save a thread title, and Escape leaves an edit unsaved", async ({ page }) => {
  await untitledThreadOpen(page);
  const heading = inThread(page).getByRole("heading", { exact: true, level: 2, name: "Saved by Enter" });
  await inThread(page).getByRole("button", { exact: true, name: "Add title" }).click();
  await typedAndPressed(page, "Saved by Enter", "Enter");

  await expect(heading).toBeVisible();
  await expect(inThread(page).getByRole("button", { exact: true, name: "Edit title" })).toBeFocused();

  await page.keyboard.press("Enter");
  await typedAndPressed(page, "Not saved", "Escape");

  await expect(heading).toBeVisible();
  await expect(inThread(page)).toBeVisible();
});
