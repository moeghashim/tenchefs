import type { Browser, Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

interface Viewing {
  readonly page: Page;
  readonly watched: string;
}

async function profileOf({ page, watched }: Viewing): Promise<Locator> {
  const viewer = await newIdentity({ kind: "human", name: `${watched}-viewer` });
  await logInWithStream({ page, token: viewer.token });
  await page.goto(`/#/people/${watched}`);
  return page.getByRole("complementary", { exact: true, name: "Profile" });
}

async function tabOf(browser: Browser, token: string): Promise<() => Promise<void>> {
  const other = await browser.newContext();
  await logInWithStream({ page: await other.newPage(), token });
  return async () => {
    await other.close();
  };
}

async function lastSeenAt(watched: string): Promise<string> {
  const { presence } = await adminClient().presence();
  const [at = ""] = presence
    .filter(({ identity, online }) => identity === watched && !online)
    .map(({ lastSeenAt: seen = "" }) => seen);
  return at;
}

interface Closing extends Viewing {
  readonly closeTab: () => Promise<void>;
}

async function closeAndPin({ closeTab, page, watched }: Closing): Promise<void> {
  await closeTab();

  await expect
    .poll(async () => {
      const at = await lastSeenAt(watched);
      return at;
    })
    .not.toBe("");

  await page.clock.setFixedTime(await lastSeenAt(watched));
}

test("a human whose tab opens shows online in another browser, and offline once it closes and the grace ends", async ({
  browser,
  page,
}) => {
  const watched = unique("browser-presence-watcher");
  const watcher = await newIdentity({ kind: "human", name: watched });
  const profile = await profileOf({ page, watched });

  await expect(profile.getByRole("img", { exact: true, name: `${watched}, Offline` })).toBeVisible();

  const closeTab = await tabOf(browser, watcher.token);

  await expect(profile.getByRole("img", { exact: true, name: `${watched}, Online` })).toBeVisible();
  await expect(profile.getByText("Online · web", { exact: true })).toBeVisible();

  await closeAndPin({ closeTab, page, watched });

  await expect(
    profile.getByRole("img", { exact: true, name: `${watched}, Offline, last seen just now` }),
  ).toBeVisible();
  await expect(profile.getByText("Offline · last seen just now", { exact: true })).toBeVisible();
});
