import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, sidebarLink } from "./regions.ts";
import type { Page } from "@playwright/test";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";
import { walk } from "./walk.ts";

const test = base.extend(probeFixtures);

const APPROVE = "💻 Approve from another device";
const NARROW = { height: 740, width: 360 } as const;
const NO_OVERFLOW = 0;

function sidewaysScroll(page: Page): () => Promise<number> {
  return async () => {
    const overflow = await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth - globalThis.document.documentElement.clientWidth,
    );
    return overflow;
  };
}

test("the login cards, the waiting view and Back are reachable by keyboard alone", async ({ page }) => {
  await page.goto("/");
  const field = page.getByLabel("Token", { exact: true });

  await expect(field).toBeFocused();

  await walk({
    page,
    steps: [
      { focused: inPane(page).getByRole("button", { exact: true, name: APPROVE }), keys: "Shift+Tab" },
      {
        focused: inPane(page).getByRole("button", { exact: true, name: "Back" }),
        keys: "Enter",
        shows: [inPane(page).getByLabel("Code", { exact: true })],
      },
      { focused: field, keys: "Enter", shows: [inPane(page).getByRole("button", { exact: true, name: APPROVE })] },
    ],
  });
});

test("on a narrow screen the cards and the waiting view fit, with no sideways scroll", async ({ page }) => {
  await page.setViewportSize(NARROW);
  await page.goto("/");
  const approve = inPane(page).getByRole("button", { exact: true, name: APPROVE });

  await expect(approve).toBeInViewport();
  await expect(page.getByLabel("Token", { exact: true })).toBeInViewport();
  await expect.poll(sidewaysScroll(page)).toBe(NO_OVERFLOW);

  await approve.click();

  await expect(inPane(page).getByLabel("Code", { exact: true })).toBeInViewport();
  await expect(inPane(page).getByRole("button", { exact: true, name: "Back" })).toBeInViewport();
  await expect.poll(sidewaysScroll(page)).toBe(NO_OVERFLOW);
});

test("a browser approved from another logged-in client gets the session cookie and logs in without a reload", async ({
  page,
}) => {
  await adminClient().createChannel({ name: unique("browser-web-login") });
  const human = await newIdentity({ kind: "human", name: unique("browser-web-approver") });
  await page.goto("/");
  await inPane(page).getByRole("button", { exact: true, name: APPROVE }).click();
  const code = await inPane(page).getByLabel("Code", { exact: true }).textContent();
  await human.client.approveLogin(code ?? "");

  await expect(sidebarLink({ label: `#${unique("browser-web-login")}`, page })).toBeVisible();

  await page.reload();

  await expect(sidebarLink({ label: `#${unique("browser-web-login")}`, page })).toBeVisible();
});
