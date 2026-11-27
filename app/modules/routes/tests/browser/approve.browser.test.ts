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
  readonly userCode: string;
}

interface Opening {
  readonly baseURL: string | undefined;
  readonly page: Page;
}

interface Opened {
  readonly anonymous: CookoutClient;
  readonly started: Awaited<ReturnType<CookoutClient["startLogin"]>>;
}

async function typedCode(page: Page, userCode: string): Promise<void> {
  const field = page.getByRole("textbox", { exact: true, name: "Code" });

  await expect(field).toHaveValue("");

  await field.fill(userCode);
  await inPane(page).getByRole("button", { exact: true, name: "Show" }).click();
}

async function screenshotIn({ page, theme, userCode }: Shot): Promise<void> {
  await page.evaluate((chosen) => {
    globalThis.localStorage.setItem("cookout-theme", chosen);
  }, theme);
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

  await typedCode(page, userCode);

  await expect(inPane(page).getByRole("button", { exact: true, name: "Approve" })).toBeVisible();

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

const NARROW = { height: 740, width: 360 } as const;
const NO_OVERFLOW = 0;

test("a human opens the approval link, which holds no code, types the code, checks its kind and host, and approves it", async ({
  baseURL,
  page,
}) => {
  const { anonymous, started } = await openApproval({ baseURL, page });

  await typedCode(page, started.userCode);

  await expect(page.getByText("Kind: terminal login", { exact: true })).toBeVisible();
  await expect(page.getByText("From: browser-laptop", { exact: true })).toBeVisible();

  await screenshotIn({ page, theme: "dark", userCode: started.userCode });
  await screenshotIn({ page, theme: "light", userCode: started.userCode });
  await inPane(page).getByRole("button", { exact: true, name: "Approve" }).click();

  await expect(
    page.getByText("Approved. Your terminal finishes logging in now; you can close this page.", { exact: true }),
  ).toBeVisible();
  await expect(anonymous.collectLogin(started.requestId)).resolves.toMatchObject({
    identity: { name: unique("browser-approver") },
    status: "approved",
  });
});

test("on a narrow screen the code field, the details and Approve all fit, with no sideways scroll", async ({
  baseURL,
  page,
}) => {
  await page.setViewportSize(NARROW);
  const { started } = await openApproval({ baseURL, page });

  await typedCode(page, started.userCode);
  const approve = inPane(page).getByRole("button", { exact: true, name: "Approve" });

  await expect(approve).toBeInViewport();
  await expect(page.getByText("From: browser-laptop", { exact: true })).toBeInViewport();

  const overflow = await page.evaluate(
    () => globalThis.document.documentElement.scrollWidth - globalThis.document.documentElement.clientWidth,
  );

  expect(overflow).toBe(NO_OVERFLOW);
});
