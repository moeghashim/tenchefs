import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inProfile } from "./regions.ts";
import { logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const TYPED = "someone-else";

async function newAdmin(): Promise<string> {
  const name = unique("browser-field-escape-admin");
  const { token } = await newIdentity({ kind: "human", name });
  await adminClient().makeAdmin(name);
  return token;
}

async function transferFieldOfAgent(page: Page): Promise<Locator> {
  const owner = unique("browser-field-escape-owner");
  const agent = unique("browser-field-escape-bot");
  await newIdentity({ kind: "human", name: owner });
  await newIdentity({ kind: "agent", name: agent, owner });
  await logInToChannels({ page, token: await newAdmin(), url: `/#/people/${agent}` });
  return inProfile(page)
    .getByRole("form", { exact: true, name: `Transfer @${agent}` })
    .getByRole("textbox", { exact: true, name: "Transfer to (a human's name)" });
}

test("the first Escape in the profile's Transfer field leaves it with the text kept, and the second closes the panel", async ({
  page,
}) => {
  const field = await transferFieldOfAgent(page);
  await field.fill(TYPED);

  await field.press("Escape");

  await expect(inProfile(page)).toBeFocused();
  await expect(field).toHaveValue(TYPED);

  await page.keyboard.press("Escape");

  await expect(inProfile(page)).toBeHidden();
});
