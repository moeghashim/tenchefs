import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logInToChannels } from "./login.ts";
import { unique } from "./names.ts";

const NARROW = { height: 900, width: 600 };
const ONE_LINE = 1;
const LONG_DESCRIPTION =
  "A description long enough to take every pixel the header has left, and then a great many more.";
const LONG_NAME = "browser-a-channel-name-far-too-wide-for-the-header-on-a-narrow-screen";

interface Fit {
  readonly lines: number;
  readonly truncated: boolean;
}

async function fitOf(page: Page): Promise<Fit> {
  const fit = await page.evaluate(() => {
    const title = globalThis.document.querySelector("main h1");
    if (title === null) {
      return { lines: 0, truncated: false };
    }
    const range = globalThis.document.createRange();
    range.selectNodeContents(title);
    const tops = new Set<number>();
    for (const rect of range.getClientRects()) {
      tops.add(Math.round(rect.top));
    }
    return { lines: tops.size, truncated: title.scrollWidth > title.clientWidth };
  });
  return fit;
}

test("a hyphenated channel title stays on one line at full width beside a long description", async ({ page }) => {
  const channel = unique("browser-ai-hero");
  const { token } = await newIdentity({ kind: "human", name: unique("browser-pane-header") });
  await adminClient().createChannel({ description: LONG_DESCRIPTION, name: channel });
  await logInToChannels({ page, token, url: `/#/channels/${channel}` });
  await page.setViewportSize(NARROW);

  await expect(inPane(page).getByRole("heading", { exact: true, level: 1, name: `#${channel}` })).toBeVisible();

  expect(await fitOf(page)).toStrictEqual({ lines: ONE_LINE, truncated: false });
});

test("a title wider than the header truncates on one line, and the header's action stays visible", async ({ page }) => {
  const channel = unique(LONG_NAME);
  const { token } = await newIdentity({ kind: "human", name: unique("browser-pane-header-wide") });
  await adminClient().createChannel({ description: LONG_DESCRIPTION, name: channel });
  await logInToChannels({ page, token, url: `/#/channels/${channel}` });
  await page.setViewportSize(NARROW);

  await expect(inPane(page).getByRole("heading", { exact: true, level: 1, name: `#${channel}` })).toBeVisible();
  await expect(inPane(page).getByRole("button", { exact: true, name: "Subscribe" })).toBeInViewport({ ratio: 1 });

  expect(await fitOf(page)).toStrictEqual({ lines: ONE_LINE, truncated: true });
});
