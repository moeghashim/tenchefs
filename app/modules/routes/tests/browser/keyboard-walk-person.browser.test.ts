import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { copiesRecorded, tokenCopied, walk } from "./walk.ts";
import { inDialog, inProfile } from "./regions.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

function button(page: Page, name: string): Locator {
  return inProfile(page).getByRole("button", { exact: true, name });
}

function inConfirm(page: Page, name: string): Locator {
  return inDialog(page).getByRole("button", { exact: true, name });
}

async function personProfileOpen(page: Page): Promise<string> {
  const prefix = unique("browser-walk-person");
  const [viewer, ada] = [`${prefix}-viewer`, `${prefix}-ada`];
  const me = await newIdentity({ kind: "human", name: viewer });
  await adminClient().makeAdmin(viewer);
  const poster = await newIdentity({ kind: "human", name: ada });
  await adminClient().createChannel({ name: prefix });
  await poster.client.createMessage({ channel: prefix, text: "Here." });
  await logIn({ page, token: me.token, url: `/#/people/${ada}` });

  await expect(button(page, "Deactivate")).toBeVisible();

  return ada;
}

test("a person's profile by keyboard alone: the admin toggle, Deactivate, Reactivate and its token", async ({
  page,
}) => {
  await copiesRecorded(page);
  const ada = await personProfileOpen(page);
  await inProfile(page).getByRole("link", { exact: true, name: "Close profile" }).focus();
  await walk({
    page,
    steps: [
      { focused: button(page, "Make admin"), keys: "Tab" },
      { focused: button(page, "Remove admin"), keys: "Enter" },
      { focused: button(page, "Make admin"), keys: "Enter" },
      { focused: button(page, "Deactivate"), keys: "Tab" },
      { focused: inConfirm(page, "Cancel"), keys: "Enter" },
      { focused: button(page, "Deactivate"), gone: [inDialog(page)], keys: "Escape" },
      { focused: inConfirm(page, "Cancel"), keys: "Enter" },
      { focused: inConfirm(page, `Deactivate @${ada}`), keys: "Tab" },
      { focused: button(page, "Reactivate"), gone: [inDialog(page)], keys: "Enter" },
      { focused: inConfirm(page, "Cancel"), keys: "Enter" },
      { focused: inConfirm(page, `Reactivate @${ada}`), keys: "Tab" },
      { focused: button(page, "Copy token"), keys: "Enter" },
      { focused: button(page, "Copy token"), keys: "Enter", shows: [tokenCopied(page)] },
    ],
  });
});
