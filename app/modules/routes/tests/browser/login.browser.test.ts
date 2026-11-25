import { adminClient, newIdentity } from "./people.ts";
import { alertSaying, inPane, sidebarLink } from "./regions.ts";
import { test as base, expect } from "@playwright/test";
import { logIn, sessionTokenOf } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { testClient } from "../../../testing/index.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

test("a human logs in with their token, sees the channel list and opens a channel", async ({ page }) => {
  await adminClient().createChannel({ description: "Where the browser test lands.", name: unique("browser-lobby") });
  await adminClient().createMessage({ channel: unique("browser-lobby"), text: "Welcome in" });

  const { token } = await newIdentity({ kind: "human", name: unique("browser-human") });
  await logIn({ page, token });
  await sidebarLink({ label: `#${unique("browser-lobby")}`, page }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`#${unique("browser-lobby")}`);
  await expect(page.getByRole("feed", { exact: true, name: "Messages" }).getByRole("article")).toContainText([
    "Welcome in",
  ]);
});

test("the session cookie keeps a human logged in across a reload", async ({ page }) => {
  await adminClient().createChannel({ name: unique("browser-reload") });

  const { token } = await newIdentity({ kind: "human", name: unique("browser-reloader") });
  await logIn({ page, token });

  await expect(sidebarLink({ label: `#${unique("browser-reload")}`, page })).toBeVisible();

  await page.reload();

  await expect(sidebarLink({ label: `#${unique("browser-reload")}`, page })).toBeVisible();
});

test("an agent's token is refused, and the login form stays", async ({ page }) => {
  const { token } = await newIdentity({ kind: "agent", name: unique("browser-agent") });
  await logIn({ page, token });

  await expect(alertSaying({ page, start: "Couldn't log in" })).toHaveText(/^Couldn't log in \(human_only\)/u);
  await expect(page.getByRole("form", { exact: true, name: "Log in" })).toBeVisible();
});

test("a human logs out from Settings by keyboard, lands on the login form, and the old session stays ended", async ({
  page,
}) => {
  const { token } = await newIdentity({ kind: "human", name: unique("browser-leaver") });
  await logIn({ page, token, url: "/#/settings/session" });
  const logOut = inPane(page).getByRole("button", { exact: true, name: "Log out" });
  await logOut.focus();
  const sessionToken = await sessionTokenOf(page);
  await page.keyboard.press("Enter");

  await expect(page.getByLabel("Token", { exact: true })).toBeFocused();

  await page.reload();

  await expect(page.getByRole("form", { exact: true, name: "Log in" })).toBeVisible();
  await expect(testClient({ token: sessionToken }).whoami()).rejects.toMatchObject({
    code: "token_unknown",
  });
});
