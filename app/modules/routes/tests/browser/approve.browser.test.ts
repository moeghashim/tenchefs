import { test as base, expect } from "@playwright/test";
import type { CookoutClient } from "../../../sdk/index.ts";
import type { Page } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logIn } from "./login.ts";
import { newIdentity } from "./people.ts";
import { probeFixtures } from "./probe.ts";
import { testClient } from "../../../testing/index.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

interface Shot {
  readonly page: Page;
  readonly theme: "dark" | "light";
}

interface Opening {
  readonly baseURL: string | undefined;
  readonly page: Page;
}

interface Opened {
  readonly anonymous: CookoutClient;
  readonly started: Awaited<ReturnType<CookoutClient["startLogin"]>>;
}

async function screenshotIn({ page, theme }: Shot): Promise<void> {
  await page.evaluate((chosen) => {
    globalThis.localStorage.setItem("cookout-theme", chosen);
  }, theme);
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.getByLabel("Code", { exact: true })).toBeVisible();

  await page.screenshot({ path: test.info().outputPath(`approval-page-${theme}.png`) });
}

async function openApproval({ baseURL, page }: Opening): Promise<Opened> {
  const anonymous = testClient({ env: {}, url: baseURL ?? "" });
  const { token } = await newIdentity({ kind: "human", name: unique("browser-approver") });
  const started = await anonymous.startLogin({ host: "browser-laptop" });
  await logIn({ page, token });
  await page.goto(started.approvalPath);
  return { anonymous, started };
}

test("a human opens a login request's approval link, checks the code, and approves it", async ({ baseURL, page }) => {
  const { anonymous, started } = await openApproval({ baseURL, page });

  await expect(page.getByLabel("Code", { exact: true })).toHaveText(started.userCode);
  await expect(
    page.getByText(`Requested by browser-laptop, until ${started.expiresAt}.`, { exact: true }),
  ).toBeVisible();

  await screenshotIn({ page, theme: "dark" });
  await screenshotIn({ page, theme: "light" });
  await inPane(page).getByRole("button", { exact: true, name: "Approve" }).click();

  await expect(
    page.getByText("Approved. Your terminal finishes logging in now; you can close this page.", { exact: true }),
  ).toBeVisible();
  await expect(anonymous.collectLogin(started.requestId)).resolves.toMatchObject({
    identity: { name: unique("browser-approver") },
    status: "approved",
  });
});
