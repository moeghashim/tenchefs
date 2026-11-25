import { test as base, expect } from "@playwright/test";
import { inSidebar } from "./regions.ts";
import { logInWithStream } from "./login.ts";
import { newIdentity } from "./people.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

test("a human who logs in shows online in their own sidebar", async ({ page }) => {
  const name = unique("browser-own-presence");
  const human = await newIdentity({ kind: "human", name });

  await logInWithStream({ page, token: human.token });

  await expect(inSidebar(page).getByRole("link", { exact: true, name: `${name}, Online` })).toBeVisible();
});
