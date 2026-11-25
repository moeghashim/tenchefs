import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logInToChannels } from "./login.ts";
import { pressedPrevented } from "./prevented.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const RESULTS = { exact: true, name: "Search results" } as const;
const BOX = { exact: true, name: "Search" } as const;

interface Opened {
  readonly thread: number;
  readonly reply: number;
}

async function openedOn(page: Page, channel: string): Promise<Opened> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const { message } = await admin.createMessage({ channel, text: `Pangolinkey deploy ${channel}` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await reader.client.follow(message.id);
  const { message: reply } = await admin.createMessage({
    channel,
    replyTo: message.id,
    text: `Pangolinkey noon ${channel}`,
  });
  await logInToChannels({ page, token: reader.token });
  return { reply: reply.id, thread: message.id };
}

const SHORTCUT = { ctrlKey: true, key: "k" } as const;
const BOTH = 2;

async function searched(page: Page, query: string): Promise<void> {
  await page.keyboard.press("Control+k");
  await page.keyboard.type(query);
}

async function pressed(page: Page, keys: readonly string[]): Promise<void> {
  const [key, ...rest] = keys;
  if (typeof key === "string") {
    await page.keyboard.press(key);
    await pressed(page, rest);
  }
}

async function selectedInInbox(page: Page, channel: string): Promise<string> {
  await openedOn(page, channel);
  await page.goto("/#/inbox");

  await expect(inPane(page).getByText(`Pangolinkey noon ${channel}`, { exact: true })).toBeVisible();

  await page.keyboard.press("j");

  await expect(page).toHaveURL(/#\/inbox\/.+/u);

  return page.url();
}

test("ctrl+K focuses the search box from a message box, with the browser's own shortcut prevented", async ({
  page,
}) => {
  const channel = unique("browser-search-ctrl");
  const opened = await openedOn(page, channel);
  await page.goto(`/#/channels/${channel}/threads/${String(opened.thread)}`);
  await page.getByRole("textbox", { exact: true, name: "Reply" }).click();
  const prevented = await pressedPrevented({ ...SHORTCUT, page });

  await expect(page.getByRole("combobox", BOX)).toBeFocused();
  expect(prevented).toBe(true);
});

test("Inbox keys typed in the search box change nothing in the Inbox", async ({ page }) => {
  const selected = await selectedInInbox(page, unique("browser-search-letters"));
  await searched(page, "jkeu");

  await expect(page.getByRole("combobox", BOX)).toHaveValue("jkeu");
  await expect(page.getByRole("combobox", BOX)).toBeFocused();

  expect(page.url()).toBe(selected);
});

test("Escape closes the list, gives focus back, and the Inbox's selected row stays selected", async ({ page }) => {
  const channel = unique("browser-search-escape");
  const selected = await selectedInInbox(page, channel);
  await searched(page, `pangolinkey ${channel}`);

  await expect(page.getByRole("listbox", RESULTS)).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByRole("listbox", RESULTS)).toBeHidden();
  await expect(inPane(page).locator(`a[data-feed-row][href="${new URL(selected).hash}"]`)).toBeFocused();

  expect(page.url()).toBe(selected);
});

test("Down, Up and Enter open the highlighted result", async ({ page }) => {
  const channel = unique("browser-search-arrows");
  const opened = await openedOn(page, channel);
  await page.goto("/#/inbox");
  await searched(page, `pangolinkey ${channel}`);

  await expect(
    page.getByRole("listbox", RESULTS).getByRole("group", { exact: true, name: "Messages" }).getByRole("option"),
  ).toHaveCount(BOTH);

  await pressed(page, ["ArrowDown", "ArrowDown", "ArrowUp", "Enter"]);

  await expect(page).toHaveURL(
    new RegExp(`#/channels/${channel}/threads/${String(opened.thread)}/messages/${String(opened.reply)}$`, "u"),
  );
  await expect(page.getByRole("listbox", RESULTS)).toBeHidden();
});

const SUGGESTIONS = { exact: true, name: "Filter suggestions" } as const;
function prefix(): string {
  return `${unique("browser-suggest-keys")}-`;
}

async function suggestionsOpened(page: Page): Promise<void> {
  const admin = adminClient();
  await Promise.all(
    ["a", "b", "c"].map(async (end) => {
      await admin.createChannel({ name: `${prefix()}${end}` });
    }),
  );
  const reader = await newIdentity({ kind: "human", name: `${prefix()}reader` });
  await logInToChannels({ page, token: reader.token });
  await page.goto("/#/inbox");
  await searched(page, `in:${prefix()}`);
}

async function expectSelected(page: Page, end: string): Promise<void> {
  await expect(
    page
      .getByRole("listbox", SUGGESTIONS)
      .getByRole("option", { exact: true, name: `#${prefix()}${end}`, selected: true }),
  ).toBeVisible();
}

async function wrappedAndTabbed(page: Page): Promise<void> {
  await expectSelected(page, "a");
  await page.keyboard.press("ArrowUp");
  await expectSelected(page, "c");
  await pressed(page, ["ArrowDown", "ArrowDown", "Tab"]);

  await expect(page.getByRole("combobox", BOX)).toHaveValue(`in:#${prefix()}b `);
  await expect(page.getByRole("combobox", BOX)).toBeFocused();
  await expect(page.getByRole("listbox", SUGGESTIONS)).toBeHidden();
}

async function enteredThenEscaped(page: Page): Promise<void> {
  await page.keyboard.type(`in:${prefix()}c`);
  await page.keyboard.press("Enter");

  await expect(page.getByRole("combobox", BOX)).toHaveValue(`in:#${prefix()}b in:#${prefix()}c `);

  await page.keyboard.type(`in:${prefix()}`);
  await page.keyboard.press("Escape");

  await expect(page.getByRole("listbox", SUGGESTIONS)).toBeHidden();
  await expect(page.getByRole("combobox", BOX)).toBeFocused();
  await expect(page.getByRole("combobox", BOX)).toHaveValue(`in:#${prefix()}b in:#${prefix()}c in:${prefix()}`);
}

test("while filter suggestions show, Up and Down wrap, Tab and Enter put one in, Escape hides them, then closes search", async ({
  page,
}) => {
  await suggestionsOpened(page);
  const before = page.url();
  await wrappedAndTabbed(page);
  await enteredThenEscaped(page);
  await page.keyboard.press("Escape");

  await expect(page.getByRole("listbox", RESULTS)).toBeHidden();
  await expect(page.getByRole("combobox", BOX)).not.toBeFocused();

  expect(page.url()).toBe(before);
});
