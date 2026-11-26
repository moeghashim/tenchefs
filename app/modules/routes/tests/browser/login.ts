import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { inPane } from "./regions.ts";
import { sessionCookieName } from "../../../identities/index.ts";

interface LogIn {
  readonly page: Page;
  readonly token: string;
  readonly url?: string;
  readonly waitUntil?: "commit" | "load";
}

const SESSION_PATH = "/v1/session";
const STREAM_PATH = "/v1/events";

export async function logInThroughForm({ page, token, url = "/" }: LogIn): Promise<void> {
  await page.goto(url);
  await page.getByLabel("Token", { exact: true }).fill(token);
  await inPane(page).getByRole("button", { exact: true, name: "Log in" }).click();
}

export async function logIn({ page, token, url = "/", waitUntil = "load" }: LogIn): Promise<void> {
  const response = await page.request.post(SESSION_PATH, { headers: { authorization: `Bearer ${token}` } });

  expect(response.ok(), await response.text()).toBe(true);

  await page.goto(url, { waitUntil });
}

export async function logInToChannels(login: LogIn): Promise<void> {
  await logIn(login);

  await expect(login.page.getByRole("list", { exact: true, name: "Channels" })).toBeAttached();
}

export async function logInWithStream(login: LogIn): Promise<void> {
  const streamOpen = login.page.waitForResponse((response) => response.url().includes(STREAM_PATH));
  await logIn(login);
  await streamOpen;
}

export async function logInThroughFormWithStream(login: LogIn): Promise<void> {
  const streamOpen = login.page.waitForResponse((response) => response.url().includes(STREAM_PATH));
  await logInThroughForm(login);
  await streamOpen;
}

export async function sessionTokenOf(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  for (const { name, value } of cookies) {
    if (name === sessionCookieName) {
      return value;
    }
  }
  return "";
}

export type { LogIn };
