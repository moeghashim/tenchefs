import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { createTestAgent, testAgentDisplayName } from "../../../testing/index.ts";
import { inPane, inProfile } from "./regions.ts";
import type { Identity } from "../../../sdk/index.ts";
import type { Page } from "@playwright/test";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

async function offeredOn(page: Page, identity: Identity): Promise<void> {
  const text = `@${identity.name} has had no activity for 30 days. Deactivate it?`;
  const offer = { cleared: false, id: 1, identity, quietDays: 30, raisedAt: identity.createdAt, text };
  await page.route("**/v1/inbox", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({
      body: body.replace('"deactivationOffers":[]', `"deactivationOffers":[${JSON.stringify(offer)}]`),
      response,
    });
  });
}

test("an offer row's name opens the identity's profile panel", async ({ page }) => {
  const ownerName = unique("browser-offers-owner");
  const agent = `${ownerName}/scout`;
  const owner = await newIdentity({ kind: "human", name: ownerName });
  const { identity } = await createTestAgent({ by: adminClient(), name: agent, owner: ownerName });
  await offeredOn(page, identity);
  await logIn({ page, token: owner.token, url: "/#/inbox" });

  await inPane(page)
    .getByRole("list", { exact: true, name: "For you" })
    .getByRole("link", { exact: true, name: testAgentDisplayName(agent) })
    .click();

  await expect(page).toHaveURL(new RegExp(`#/inbox\\?profile=${ownerName}/scout$`, "u"));
  await expect(
    inProfile(page).getByRole("heading", {
      exact: true,
      name: `${testAgentDisplayName(agent)} @${identity.name} agent`,
    }),
  ).toBeVisible();
});
