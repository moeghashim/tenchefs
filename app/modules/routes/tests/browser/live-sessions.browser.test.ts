import type { Browser, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inDialog, inPane, inProfile } from "./regions.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

interface Opening {
  readonly browser: Browser;
  readonly token: string;
  readonly hash: string;
}

async function openAs({ browser, hash, token }: Opening): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await logInWithStream({ page, token });
  await page.goto(`/${hash}`);
  return page;
}

async function ownerWithSession(): Promise<string> {
  const owner = unique("browser-live-sessions-owner");
  const agent = unique("browser-live-sessions-bot");
  const human = await newIdentity({ kind: "human", name: owner });
  await newIdentity({ kind: "agent", name: agent, owner });
  await human.client.join({ as: agent, host: "laptop" });
  return human.token;
}

async function newAdmin(): Promise<string> {
  const adminName = unique("browser-live-sessions-admin");
  const { token } = await newIdentity({ kind: "human", name: adminName });
  await adminClient().makeAdmin(adminName);
  return token;
}

test("an admin revoking an agent's session in one browser shows at once in its owner's Settings in another", async ({
  browser,
}) => {
  const agent = unique("browser-live-sessions-bot");
  const ownerPage = await openAs({ browser, hash: "#/settings/agents", token: await ownerWithSession() });
  const card = inPane(ownerPage).getByRole("group", { exact: true, name: `@${agent}` });

  await expect(card).toContainText("Joined from laptop");

  const adminPage = await openAs({ browser, hash: `#/people/${agent}`, token: await newAdmin() });

  await inProfile(adminPage).getByRole("button", { exact: true, name: "Revoke session" }).click();
  await inDialog(adminPage).getByRole("button", { exact: true, name: "Revoke session" }).click();

  await expect(card).toContainText("No live session");
});
