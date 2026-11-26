import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

async function channelWhereZedPostedLast(channel: string): Promise<string> {
  await adminClient().createChannel({ name: channel });
  const ada = await newIdentity({ kind: "human", name: `${channel}-ada` });
  const zed = await newIdentity({ kind: "human", name: `${channel}-zed` });
  await ada.client.createMessage({ channel, text: "Earlier" });
  await zed.client.createMessage({ channel, text: "Newest" });
  const { token } = await newIdentity({ kind: "human", name: unique("browser-posters-reader") });
  return token;
}

test("in a channel's box, typing @ suggests the channel's newest poster first", async ({ page }) => {
  const channel = unique("browser-posters");
  await logIn({ page, token: await channelWhereZedPostedLast(channel) });
  await page.goto(`/#/channels/${channel}`);

  await expect(inPane(page).getByText("Newest", { exact: true })).toBeVisible();

  await inPane(page).getByLabel("Message", { exact: true }).pressSequentially(`@${channel}`);

  await expect(
    inPane(page).getByRole("listbox", { exact: true, name: "Mention suggestions" }).getByRole("option"),
  ).toHaveText([`@${channel}-zed`, `@${channel}-ada`]);
});
