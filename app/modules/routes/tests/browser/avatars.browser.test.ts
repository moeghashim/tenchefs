import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { avatarPng } from "../../../testing/index.ts";
import { inPane } from "./regions.ts";
import { logInToChannels } from "./login.ts";
import { unique } from "./names.ts";

const SIDE = 256;
const NONE = 0;
const TEXT = "Hello with a face";

async function messageWithAvatar(page: Page, channel: string): Promise<Locator> {
  await adminClient().createChannel({ name: channel });
  const name = `${channel}-ann`;
  const poster = await newIdentity({ displayName: "Avatar Poster", kind: "human", name });
  await poster.client.setAvatar(name, avatarPng());
  await poster.client.createMessage({ channel, text: TEXT });
  await logInToChannels({ page, token: poster.token });
  await page.goto(`/#/channels/${channel}`);
  return inPane(page)
    .getByRole("feed", { exact: true, name: "Messages" })
    .getByRole("article")
    .filter({ has: page.getByText(TEXT, { exact: true }) });
}

test("an identity's avatar shows beside its message in place of its initials, named by its display name", async ({
  page,
}) => {
  const message = await messageWithAvatar(page, unique("browser-avatar-image"));

  await expect(message.getByRole("img", { exact: true, name: "Avatar Poster" })).toHaveJSProperty("naturalWidth", SIDE);
  await expect(message.locator("[data-initials]")).toHaveCount(NONE);
});

test("an avatar that fails to load shows the identity's initials instead", async ({ page }) => {
  await page.route("**/v1/avatars/**", async (route) => {
    await route.abort();
  });
  const message = await messageWithAvatar(page, unique("browser-avatar-fallback"));

  await expect(message.getByTestId("avatar")).toHaveAttribute("data-initials", "BA");
  await expect(message.getByRole("img", { exact: true, name: "Avatar Poster" })).toHaveCount(NONE);
});
