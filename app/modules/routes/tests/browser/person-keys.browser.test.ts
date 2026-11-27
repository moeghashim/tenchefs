import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inProfile } from "./regions.ts";
import { logIn, logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const BOX = { exact: true, name: "Message" } as const;
const TWO_PEOPLE = 2;
const NONE = 0;

interface Posted {
  readonly author: string;
  readonly mentioned: string;
}

interface Pair {
  readonly first: string;
  readonly second: string;
}

async function copiesRecorded(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "clipboard", {
      get: (): Pick<Clipboard, "writeText"> => ({
        writeText: async (text: string): Promise<void> => {
          globalThis.document.documentElement.dataset["copied"] = text;
          await Promise.resolve();
        },
      }),
    });
  });
}

async function postedAndOpen(page: Page, channel: string): Promise<Posted> {
  const author = `${channel}-author`;
  const mentioned = `${channel}-friend`;
  await adminClient().createChannel({ name: channel });
  await newIdentity({ kind: "human", name: mentioned });
  const poster = await newIdentity({ kind: "human", name: author });
  await poster.client.createMessage({ channel, text: `Say hi to @${mentioned}` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInToChannels({ page, token: reader.token, url: `/#/channels/${channel}` });
  return { author, mentioned };
}

function authorOf(page: Page, author: string): Locator {
  return page.getByRole("feed", { exact: true, name: "Messages" }).getByRole("link", { exact: true, name: author });
}

async function boxHolds(page: Page, name: string): Promise<void> {
  const text = `@${name} `;

  await expect(page.getByRole("textbox", BOX)).toBeFocused();
  await expect(page.getByRole("textbox", BOX)).toHaveValue(text);
  await expect(page.getByRole("textbox", BOX)).toHaveJSProperty("selectionStart", text.length);
}

async function peopleShown(page: Page, prefix: string): Promise<Pair> {
  await adminClient().createChannel({ name: prefix });
  const pair = { first: `${prefix}-ada`, second: `${prefix}-bea` };
  const reader = await newIdentity({ kind: "human", name: pair.first });
  await newIdentity({ kind: "human", name: pair.second });
  await logInToChannels({ page, token: reader.token, url: "/#/people" });
  await page.getByRole("textbox", { exact: true, name: "Filter by name" }).fill(prefix);

  await expect(page.getByRole("list", { exact: true, name: "Identities" }).getByRole("link")).toHaveCount(TWO_PEOPLE);

  return pair;
}

async function arrowsMove(page: Page, { first, second }: Pair): Promise<void> {
  const people = page.getByRole("list", { exact: true, name: "Identities" });
  await inPane(page).getByRole("button", { exact: true, name: "Show deactivated" }).focus();
  await page.keyboard.press("Tab");

  await expect(people.getByRole("link", { exact: true, name: `${first}, Online` })).toBeFocused();

  await page.keyboard.press("ArrowDown");

  await expect(people.getByRole("link", { exact: true, name: `${second}, Offline` })).toBeFocused();

  await page.keyboard.press("ArrowUp");

  await expect(people.getByRole("link", { exact: true, name: `${first}, Online` })).toBeFocused();

  await page.keyboard.press("ArrowDown");

  await expect(people.getByRole("link", { exact: true, name: `${second}, Offline` })).toBeFocused();
}

test("one Tab enters the People list, arrows move between people, Tab leaves it, and Enter opens a profile", async ({
  page,
}) => {
  const pair = await peopleShown(page, unique("browser-people-keys"));
  await arrowsMove(page, pair);
  const people = page.getByRole("list", { exact: true, name: "Identities" });
  await page.keyboard.press("Tab");

  await expect(people.locator(":focus")).toHaveCount(NONE);

  await page.keyboard.press("Shift+Tab");

  await expect(people.getByRole("link", { exact: true, name: `${pair.second}, Offline` })).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`#/people/${pair.second}$`, "u"));
  await expect(inProfile(page).getByRole("heading", { level: 3 })).toHaveText(pair.second);
});

test("m on a focused @name puts it in the message box with the cursor after it, and c copies it and says so", async ({
  page,
}) => {
  await copiesRecorded(page);
  const { mentioned } = await postedAndOpen(page, unique("browser-person-keys-mention"));
  const mention = page
    .getByRole("feed", { exact: true, name: "Messages" })
    .getByRole("link", { exact: true, name: `@${mentioned}` });
  await mention.focus();
  await page.keyboard.press("c");

  await expect(page.getByRole("status").filter({ hasText: `Copied @${mentioned}` })).toBeAttached();
  await expect(page.locator("html")).toHaveAttribute("data-copied", `@${mentioned}`);

  await mention.focus();
  await page.keyboard.press("m");
  await boxHolds(page, mentioned);
});

test("Tab to a message's author, then m, puts @author in the message box", async ({ page }) => {
  const { author } = await postedAndOpen(page, unique("browser-person-keys-author"));
  await page.getByRole("feed", { exact: true, name: "Messages" }).getByRole("article").first().focus();
  await page.keyboard.press("Tab");

  await expect(authorOf(page, author)).toBeFocused();

  await page.keyboard.press("m");
  await boxHolds(page, author);
});

test("the person menu shows Enter, m and c beside View profile, Message and Copy name", async ({ page }) => {
  const { author } = await postedAndOpen(page, unique("browser-person-keys-menu"));
  await authorOf(page, author).click({ button: "right" });
  const menu = page.getByRole("menu", { exact: true, name: `@${author} actions` });

  await expect(menu.getByRole("menuitem", { exact: true, name: "View profile" })).toContainText("Enter");
  await expect(menu.getByRole("menuitem", { exact: true, name: "View profile" })).toHaveAttribute(
    "aria-keyshortcuts",
    "Enter",
  );
  await expect(menu.getByRole("menuitem", { exact: true, name: "Message" })).toContainText("m");
  await expect(menu.getByRole("menuitem", { exact: true, name: "Message" })).toHaveAttribute("aria-keyshortcuts", "m");
  await expect(menu.getByRole("menuitem", { exact: true, name: "Copy name" })).toContainText("c");
  await expect(menu.getByRole("menuitem", { exact: true, name: "Copy name" })).toHaveAttribute(
    "aria-keyshortcuts",
    "c",
  );
});

async function mLeavesRow(page: Page, row: Locator): Promise<void> {
  await row.focus();
  await page.keyboard.press("m");

  await expect(row).toBeFocused();
  await expect(page).toHaveURL(/#\/people$/u);
}

async function menuHasNoMessage(
  page: Page,
  { name, row }: { readonly name: string; readonly row: Locator },
): Promise<void> {
  await row.click({ button: "right" });
  const menu = page.getByRole("menu", { exact: true, name: `@${name} actions` });

  await expect(menu.getByRole("menuitem", { exact: true, name: "Copy name" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { exact: true, name: "Message" })).toHaveCount(NONE);
  await expect(menu.locator('[aria-keyshortcuts="m"]')).toHaveCount(NONE);

  await page.keyboard.press("Escape");
}

test("in the People list a row offers no m: its menu has no Message, m does nothing, and the shortcut list says m needs a message box", async ({
  page,
}) => {
  const { first } = await peopleShown(page, unique("browser-people-no-m"));
  const row = page
    .getByRole("list", { exact: true, name: "Identities" })
    .getByRole("link", { exact: true, name: `${first}, Online` });
  await mLeavesRow(page, row);
  await menuHasNoMessage(page, { name: first, row });
  await row.focus();
  await page.keyboard.press("?");
  const person = page
    .getByRole("dialog", { exact: true, name: "Keyboard shortcuts" })
    .getByRole("list", { exact: true, name: "Person" });

  await expect(person.getByRole("listitem").filter({ hasText: "Message them" })).toHaveText(
    /Message them, where there's a message box/u,
  );
});

test("→ in the kind filter chooses Humans", async ({ page }) => {
  const name = unique("browser-person-keys-kinds");
  const reader = await newIdentity({ kind: "human", name });
  await logIn({ page, token: reader.token, url: "/#/people" });
  await page.getByRole("textbox", { exact: true, name: "Filter by name" }).fill(name);
  const kinds = page.getByRole("radiogroup", { exact: true, name: "Kind" });
  await kinds.getByRole("radio", { exact: true, name: "All 1" }).focus();
  await page.keyboard.press("ArrowRight");

  await expect(kinds.getByRole("radio", { exact: true, name: "Humans 1" })).toBeChecked();
  await expect(kinds.getByRole("radio", { exact: true, name: "Humans 1" })).toBeFocused();
});

test("→ in the theme choice chooses Light", async ({ page }) => {
  const reader = await newIdentity({ kind: "human", name: unique("browser-person-keys-themes") });
  await logIn({ page, token: reader.token, url: "/#/settings/theme" });
  const themes = page.getByRole("radiogroup", { exact: true, name: "Theme" });
  await themes.getByRole("radio", { exact: true, name: "System" }).focus();
  await page.keyboard.press("ArrowRight");

  await expect(themes.getByRole("radio", { exact: true, name: "Light" })).toBeChecked();
  await expect(themes.getByRole("radio", { exact: true, name: "Light" })).toBeFocused();
});

test("End focuses the People list's last person and Home its first", async ({ page }) => {
  const { first, second } = await peopleShown(page, unique("browser-people-ends"));
  const people = page.getByRole("list", { exact: true, name: "Identities" });
  await people.getByRole("link", { exact: true, name: `${first}, Online` }).focus();
  await page.keyboard.press("End");

  await expect(people.getByRole("link", { exact: true, name: `${second}, Offline` })).toBeFocused();

  await page.keyboard.press("Home");

  await expect(people.getByRole("link", { exact: true, name: `${first}, Online` })).toBeFocused();
});
