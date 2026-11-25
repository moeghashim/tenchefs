import type { Locator, Page } from "@playwright/test";
import type { Relay, RelayFixtures, RelayOptions } from "./relay.ts";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inThread, sidebarLink } from "./regions.ts";
import type { Message } from "../../../sdk/index.ts";
import type { Person } from "./people.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { relayFixtures } from "./relay.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures).extend<RelayFixtures & RelayOptions>(relayFixtures);

const PAGE_MARK = "cookoutCatchUpMark";

interface Reading {
  readonly channel: string;
  readonly other: string;
  readonly parent: Message;
  readonly poster: Person;
  readonly reader: Person;
}

async function reading(): Promise<Reading> {
  const channel = unique("browser-catch-up");
  const other = unique("browser-catch-up-other");
  const admin = adminClient();
  await Promise.all([admin.createChannel({ name: channel }), admin.createChannel({ name: other })]);
  const poster = await newIdentity({ kind: "agent", name: `${channel}-poster` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await Promise.all([reader.client.subscribe(channel), reader.client.subscribe(other)]);
  const { message: parent } = await poster.client.createMessage({ channel, text: "Deploy at noon?" });
  return { channel, other, parent, poster, reader };
}

function rowOf(page: Page, channel: string): Locator {
  return sidebarLink({ label: `#${channel}`, page });
}

async function markPage(page: Page): Promise<void> {
  await page.evaluate((mark) => {
    Reflect.set(globalThis, mark, "kept");
  }, PAGE_MARK);
}

async function pageKept(page: Page): Promise<boolean> {
  const kept = await page.evaluate((mark) => Reflect.get(globalThis, mark) === "kept", PAGE_MARK);
  return kept;
}

async function cutWhile(page: Page, relay: Relay, work: () => Promise<void>): Promise<void> {
  const bar = page.getByRole("status", { exact: true, name: "Live link" });
  await relay.cut();

  await expect(bar).toHaveText("Reconnecting…");

  await work();
  await relay.restore();

  await expect(bar).toHaveText("");
}

test("a message, a reply and an unread count from while the live link was down appear once it is back, with no reload", async ({
  page,
  relay,
}) => {
  const { channel, other, parent, poster, reader } = await reading();
  await logInWithStream({
    page,
    token: reader.token,
    url: `${relay.url}/#/channels/${channel}/threads/${String(parent.id)}`,
  });

  await expect(inThread(page)).toContainText("Deploy at noon?");

  await markPage(page);

  await cutWhile(page, relay, async () => {
    await poster.client.createMessage({ channel, text: "Or at one?" });
    await poster.client.createMessage({ channel, replyTo: parent.id, text: "Noon works" });
    await poster.client.createMessage({ channel: other, text: "Lunch?" });
  });

  await expect(inPane(page).getByRole("feed", { exact: true, name: "Messages" })).toContainText("Or at one?");
  await expect(inThread(page).getByRole("feed", { exact: true, name: "Replies" })).toContainText("Noon works");
  await expect(rowOf(page, other)).toHaveAccessibleName(`#${other} 1 unread`);
  await expect(rowOf(page, channel)).toHaveAccessibleName(`#${channel}`);
  await expect(pageKept(page)).resolves.toBe(true);
});
