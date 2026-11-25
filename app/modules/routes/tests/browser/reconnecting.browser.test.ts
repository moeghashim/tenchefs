import type { RelayFixtures, RelayOptions } from "./relay.ts";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { relayFixtures } from "./relay.ts";
import { sidebarLink } from "./regions.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures).extend<RelayFixtures & RelayOptions>(relayFixtures);

test("cutting the live link shows the Reconnecting bar, and restoring it clears the bar and shows a channel made meanwhile", async ({
  page,
  relay,
}) => {
  const reader = await newIdentity({ kind: "human", name: unique("browser-reconnect-reader") });
  await logInWithStream({ page, token: reader.token, url: relay.url });
  const bar = page.getByRole("status", { exact: true, name: "Live link" });

  await expect(bar).toHaveText("");

  await relay.cut();

  await expect(bar).toHaveText("Reconnecting…");

  await adminClient().createChannel({ name: unique("browser-reconnect-missed") });
  await relay.restore();

  await expect(bar).toHaveText("");
  await expect(sidebarLink({ label: `#${unique("browser-reconnect-missed")}`, page })).toBeVisible();
});
