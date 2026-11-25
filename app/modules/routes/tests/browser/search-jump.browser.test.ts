import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inProfile } from "./regions.ts";
import { logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const BOX = { exact: true, name: "Search" } as const;
const RESULTS = { exact: true, name: "Search results" } as const;
const REPLY = { exact: true, name: "Reply" } as const;
const PLACES = ["Inbox", "People", "Settings"] as const;
const JUMP_GROUPS = /^(?:Places|Channels|People)$/u;
const NONE = 0;
const ONE = 1;

interface Opened {
  readonly channel: string;
  readonly reader: string;
  readonly thread: number;
}

async function openedOn(page: Page, name: string): Promise<Opened> {
  const channel = unique(name);
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const { message } = await admin.createMessage({ channel, text: `Jump hello ${channel}` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInToChannels({ page, token: reader.token });
  return { channel, reader: `${channel}-reader`, thread: message.id };
}

function moonbeam(): string {
  return `Quetzal ${unique("Moonbeam")}`;
}

function results(page: Page): Locator {
  return page.getByRole("listbox", RESULTS);
}

async function searched(page: Page, query: string): Promise<void> {
  await page.keyboard.press("Control+k");
  await page.keyboard.type(query);
}

async function pressedDown(page: Page, times: number): Promise<void> {
  if (times > NONE) {
    await page.keyboard.press("ArrowDown");
    await pressedDown(page, times - ONE);
  }
}

test("ctrl+K, part of a channel's name and Enter open that channel", async ({ page }) => {
  const { channel } = await openedOn(page, "browser-jump-zebrachan");
  await page.goto("/#/inbox");
  await searched(page, channel.replace("browser-jump-", "").toUpperCase());

  await expect(results(page).getByRole("group", { exact: true, name: "Channels" }).getByRole("option")).toHaveText([
    `#${channel}`,
  ]);

  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`#/channels/${channel}$`, "u"));
  await expect(results(page)).toBeHidden();
});

test("a person's Display name and Enter open their profile", async ({ page }) => {
  await openedOn(page, "browser-jump-person");
  await newIdentity({ kind: "human", name: unique("browser-jump-person-target") });
  await adminClient().setDisplayName(unique("browser-jump-person-target"), moonbeam());
  await page.goto("/#/inbox");
  await searched(page, moonbeam().toLowerCase());

  await expect(
    results(page)
      .getByRole("group", { exact: true, name: "People" })
      .getByRole("option", { exact: true, name: `${moonbeam()} ${unique("browser-jump-person-target")}` }),
  ).toBeVisible();

  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`#/people/${unique("browser-jump-person-target")}$`, "u"));
  await expect(inProfile(page)).toBeVisible();
});

for (const [at, place] of PLACES.entries()) {
  test(`with nothing typed the box lists Inbox, People and Settings, and Enter opens ${place}`, async ({ page }) => {
    const { channel, thread } = await openedOn(page, `browser-jump-place-${place.toLowerCase()}`);
    await page.goto(`/#/channels/${channel}/threads/${String(thread)}`);

    await expect(page.getByRole("textbox", REPLY)).toBeFocused();

    await page.keyboard.press("Control+k");

    await expect(page.getByRole("combobox", BOX)).toBeFocused();
    await expect(results(page).getByRole("group", { exact: true, name: "Places" }).getByRole("option")).toHaveText([
      ...PLACES,
    ]);

    await pressedDown(page, at);

    await expect(results(page).getByRole("option", { selected: true })).toHaveText(place);

    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(new RegExp(`#/${place.toLowerCase()}$`, "u"));
  });
}

test("a word from a message still lists the message, and Enter opens it in its thread", async ({ page }) => {
  const { channel, thread } = await openedOn(page, "browser-jump-message");
  await page.goto("/#/inbox");
  await searched(page, `jump hello ${channel}`);

  await expect(results(page).getByRole("group", { exact: true, name: "Messages" }).getByRole("option")).toContainText([
    `Jump hello ${channel}`,
  ]);

  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`#/channels/${channel}/threads/${String(thread)}$`, "u"));
  await expect(inPane(page).getByText(`Jump hello ${channel}`, { exact: true }).first()).toBeVisible();
});

test("with messages found, Down from the box goes through the channel and the person before the messages", async ({
  page,
}) => {
  const { channel, reader } = await openedOn(page, "browser-jump-order");
  await page.goto("/#/inbox");
  await searched(page, channel);

  await expect(results(page).getByRole("group", { exact: true, name: "Messages" }).getByRole("option")).toContainText([
    `Jump hello ${channel}`,
  ]);
  await expect(results(page).getByRole("option", { selected: true })).toHaveText(`#${channel}`);

  await pressedDown(page, ONE);

  await expect(results(page).getByRole("option", { selected: true })).toContainText(reader);

  await pressedDown(page, ONE);

  await expect(results(page).getByRole("option", { selected: true })).toContainText(`Jump hello ${channel}`);
});

test("a query with a filter lists only messages, even when a person's Display name holds it", async ({ page }) => {
  const { channel, reader } = await openedOn(page, "browser-jump-filter");
  await adminClient().setDisplayName(reader, `Quetzal in:#${channel} jump`);
  await page.goto("/#/inbox");
  await searched(page, `in:#${channel} jump`);

  await expect(results(page).getByRole("group", { exact: true, name: "Messages" }).getByRole("option")).toContainText([
    `Jump hello ${channel}`,
  ]);
  await expect(results(page).getByRole("group", { exact: true, name: JUMP_GROUPS })).toHaveCount(NONE);
});

test("escape closes the box and gives focus back to the reply box", async ({ page }) => {
  const { channel, thread } = await openedOn(page, "browser-jump-escape");
  await page.goto(`/#/channels/${channel}/threads/${String(thread)}`);
  const reply = page.getByRole("textbox", REPLY);
  await reply.click();
  await page.keyboard.press("Control+k");

  await expect(page.getByRole("combobox", BOX)).toBeFocused();
  await expect(results(page)).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(results(page)).toBeHidden();
  await expect(reply).toBeFocused();
});
