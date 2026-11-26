import { test as base, expect } from "@playwright/test";
import { logIn } from "./login.ts";
import { newIdentity } from "./people.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const DELAY_MS = 700;

test.use({ slowMs: DELAY_MS });

test("with the page's calls delayed, a test that reads the screen without waiting fails, and one that waits passes", async ({
  page,
}) => {
  const reader = await newIdentity({ kind: "human", name: unique("slow-reader") });
  const views = page.getByRole("list", { exact: true, name: "Views" });
  await logIn({ page, token: reader.token, waitUntil: "commit" });
  const missingItsWait = await views.isVisible();

  await expect(views).toBeVisible();
  expect(missingItsWait).toBe(false);
});
