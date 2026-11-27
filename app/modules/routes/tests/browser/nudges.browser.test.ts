import type { ClockFixtures, ClockOptions, OwnCookout } from "./clock.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inThread } from "./regions.ts";
import type { Person } from "./people.ts";
import type { TopLevelMessage } from "../../../sdk/index.ts";
import { clockFixtures } from "./clock.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures).extend<ClockFixtures & ClockOptions>(clockFixtures);

const NUDGE = "Quiet for 3 days: close it, or follow up?";
const QUIET_DAYS = 3;

interface Started {
  readonly starter: Person;
  readonly parent: TopLevelMessage;
}

async function threadStarted(cookout: OwnCookout, channel: string): Promise<Started> {
  await cookout.admin.createChannel({ name: channel });
  const starter = await cookout.newIdentity({ kind: "human", name: `${channel}-starter` });
  const { message } = await starter.client.createMessage({ channel, text: "Who owns the release notes?" });
  if (message.kind !== "top-level") {
    throw new TypeError("a new message in a channel is top-level");
  }
  return { parent: message, starter };
}

test("a nudge row's link opens its thread", async ({ ownCookout, page }) => {
  const started = await threadStarted(ownCookout, unique("browser-nudges"));
  await ownCookout.daysPass(QUIET_DAYS);
  await logIn({ page, token: started.starter.token, url: "/#/inbox" });

  await inPane(page)
    .getByRole("list", { exact: true, name: "For you" })
    .getByRole("link")
    .filter({ has: page.getByText(NUDGE, { exact: true }) })
    .click();

  await expect(page).toHaveURL(
    new RegExp(`#/channels/${unique("browser-nudges")}/threads/${String(started.parent.id)}$`, "u"),
  );
  await expect(inThread(page)).toContainText("Who owns the release notes?");
});
