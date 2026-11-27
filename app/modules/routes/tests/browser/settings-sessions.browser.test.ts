import type { Locator, Page } from "@playwright/test";
import { test as base, expect } from "@playwright/test";
import type { CookoutClient } from "../../../sdk/index.ts";
import { inPane } from "./regions.ts";
import { logIn } from "./login.ts";
import { newIdentity } from "./people.ts";
import { probeFixtures } from "./probe.ts";
import { testClient } from "../../../testing/index.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const NARROW = { height: 800, width: 360 };
const NO_OVERFLOW = 0;

interface Devices {
  readonly laptop: string;
  readonly phone: string;
}

interface Approving {
  readonly anonymous: CookoutClient;
  readonly approver: CookoutClient;
  readonly host: string;
}

async function approvedLogin({ anonymous, approver, host }: Approving): Promise<string> {
  const started = await anonymous.startLogin({ host });
  await approver.approveLogin(started.userCode);
  const collected = await anonymous.collectLogin(started.requestId);
  if (collected.status === "approved") {
    return collected.token;
  }
  throw new Error("The login was not approved.");
}

async function devicesOf(prefix: string, baseURL: string | undefined): Promise<Devices> {
  const anonymous = testClient({ env: {}, url: baseURL ?? "" });
  const { client } = await newIdentity({ kind: "human", name: unique(`${prefix}-human`) });
  const laptop = await approvedLogin({ anonymous, approver: client, host: unique(`${prefix}-laptop`) });
  const fromLaptop = testClient({ token: laptop });
  const phone = await approvedLogin({ anonymous, approver: fromLaptop, host: unique(`${prefix}-phone`) });
  return { laptop, phone };
}

function card(page: Page, where: string): Locator {
  return inPane(page).getByRole("group", { exact: true, name: unique(where) });
}

function button(page: Page, name: string): Locator {
  return inPane(page).getByRole("button", { exact: true, name });
}

function inDialog(page: Page): Locator {
  return page.getByRole("alertdialog");
}

async function openSessions(page: Page, token: string): Promise<void> {
  await logIn({ page, token, url: "/#/settings/session" });

  await expect(inPane(page).getByRole("heading", { exact: true, level: 2, name: "Sessions" })).toBeVisible();
}

async function revokedByKeys(page: Page, phone: Locator): Promise<void> {
  await phone.getByRole("button", { exact: true, name: "Revoke" }).focus();
  await page.keyboard.press("Enter");

  await expect(inDialog(page).getByRole("button", { exact: true, name: "Cancel" })).toBeFocused();

  await page.keyboard.press("Tab");

  await expect(inDialog(page).getByRole("button", { exact: true, name: "Revoke" })).toBeFocused();

  await page.keyboard.press("Enter");
}

async function loggedOutEverywhereByKeys(page: Page): Promise<void> {
  await button(page, "Log out everywhere").focus();
  await page.keyboard.press("Enter");

  await expect(
    inDialog(page).getByText("1 session will end. This browser stays logged in.", { exact: true }),
  ).toBeVisible();

  await page.keyboard.press("Tab");

  await expect(inDialog(page).getByRole("button", { exact: true, name: "Log out everywhere" })).toBeFocused();

  await page.keyboard.press("Enter");
}

test("by keyboard alone, Revoke on another session and Log out everywhere each ask first and then end it", async ({
  baseURL,
  page,
}) => {
  const { laptop } = await devicesOf("browser-sessions-keys", baseURL);
  await openSessions(page, laptop);
  const phone = card(page, "browser-sessions-keys-phone");
  await revokedByKeys(page, phone);

  await expect(phone).toHaveCount(NO_OVERFLOW);

  await loggedOutEverywhereByKeys(page);

  await expect(card(page, "browser-sessions-keys-laptop")).toHaveCount(NO_OVERFLOW);
  await expect(inPane(page).getByText("This browser", { exact: true })).toBeVisible();
});

async function sidewaysScroll(page: Page): Promise<number> {
  const overflow = await page.evaluate(
    () => globalThis.document.documentElement.scrollWidth - globalThis.document.documentElement.clientWidth,
  );
  return overflow;
}

test("on a narrow screen every session, its Revoke and Log out everywhere fit, with no sideways scroll", async ({
  baseURL,
  page,
}) => {
  await page.setViewportSize(NARROW);
  const { laptop } = await devicesOf("browser-sessions-narrow", baseURL);
  await openSessions(page, laptop);
  const phone = card(page, "browser-sessions-narrow-phone");
  await phone.scrollIntoViewIfNeeded();

  await expect(phone).toBeInViewport({ ratio: 1 });

  await button(page, "Log out everywhere").scrollIntoViewIfNeeded();

  await expect(button(page, "Log out everywhere")).toBeInViewport({ ratio: 1 });
  await expect(sidewaysScroll(page)).resolves.toBe(NO_OVERFLOW);
});
