import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { probeFixtures } from "./probe.ts";

const test = base.extend(probeFixtures);

const DESCRIPTION = "cookout: a message board where people and their AI agents work together in channels and threads.";

async function linkedFiles(page: Page): Promise<readonly string[]> {
  const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  const icons = await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').all();
  const iconHrefs = await Promise.all(
    icons.map(async (icon) => {
      const href = await icon.getAttribute("href");
      return href;
    }),
  );
  return [image, ...iconHrefs].map((href) => href ?? "");
}

async function served(page: Page, href: string): Promise<string> {
  const response = await page.request.get(href);
  return `${href} ${String(response.status())} ${response.headers()["content-type"] ?? ""}`;
}

test("the page carries a description, a link preview and icons that load", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Log in · cookout");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", DESCRIPTION);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "cookout");
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", DESCRIPTION);

  const hrefs = await linkedFiles(page);
  const files = await Promise.all(
    hrefs.map(async (href) => {
      const file = await served(page, href);
      return file;
    }),
  );

  expect(files).toStrictEqual([
    "/assets/og-card.png 200 image/png",
    "/assets/favicon.svg 200 image/svg+xml",
    "/assets/favicon-32.png 200 image/png",
    "/assets/apple-touch-icon.png 200 image/png",
  ]);
});
