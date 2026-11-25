import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inProfile, inSidebar, inTopBar, sidebarLink } from "./regions.ts";
import type { Person } from "./people.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const BOX = { exact: true, name: "Search" } as const;
const MESSAGE_BOX = { exact: true, name: "Message" } as const;
const NARROW = { height: 900, width: 600 };

interface Board {
  readonly first: string;
  readonly second: string;
  readonly reader: Person;
}

async function boardOf(prefix: string): Promise<Board> {
  const [first, second] = [`${prefix}-a`, `${prefix}-b`] as const;
  const admin = adminClient();
  await admin.createChannel({ name: first });
  await admin.createChannel({ name: second });
  const reader = await newIdentity({ kind: "human", name: `${prefix}-reader` });
  await reader.client.subscribe(first);
  await reader.client.subscribe(second);
  return { first, reader, second };
}

async function loggedIn(page: Page, prefix: string): Promise<Board> {
  const board = await boardOf(prefix);
  await logInWithStream({ page, token: board.reader.token });

  await expect(page.getByRole("list", { exact: true, name: "Channels" })).toBeVisible();

  return board;
}

async function bodyFocused(page: Page): Promise<void> {
  await page.evaluate(() => {
    const { activeElement } = globalThis.document;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  });

  await expect(page.locator("body")).toBeFocused();
}

function heading(page: Page): Locator {
  return inPane(page).getByRole("heading", { level: 1 });
}

function profileHeading(page: Page): Locator {
  return inProfile(page).getByRole("heading", { exact: true, name: "Profile" });
}

async function jumped(page: Page, query: string): Promise<void> {
  await page.keyboard.press("Control+k");
  await page.keyboard.type(query);

  await expect(page.getByRole("option", { selected: true })).toBeVisible();

  await page.keyboard.press("Enter");
}

test("the login page focuses its Token field, and logging in lands focus on the Inbox's heading", async ({ page }) => {
  const { reader } = await boardOf(unique("browser-land-login"));
  await page.goto("/");

  await expect(page.getByLabel("Token", { exact: true })).toBeFocused();

  await page.keyboard.type(reader.token);
  await page.keyboard.press("Enter");

  await expect(heading(page)).toHaveText("Inbox");
  await expect(heading(page)).toBeFocused();
});

test("alt+↓ from the page lands focus in the next channel's message box", async ({ page }) => {
  const { first, second } = await loggedIn(page, unique("browser-land-alt"));
  await page.goto(`/#/channels/${first}`);

  await expect(sidebarLink({ label: `#${first}`, page })).toHaveAttribute("aria-current", "page");

  await bodyFocused(page);
  await page.keyboard.press("Alt+ArrowDown");

  await expect(page).toHaveURL(new RegExp(`#/channels/${second}$`, "u"));
  await expect(inPane(page).getByRole("textbox", MESSAGE_BOX)).toBeFocused();
});

test("ctrl+K to Settings lands focus on its heading, and the search box is empty after the jump", async ({ page }) => {
  await loggedIn(page, unique("browser-land-place"));
  await jumped(page, "sett");

  await expect(heading(page)).toHaveText("Settings");
  await expect(heading(page)).toBeFocused();
  await expect(page.getByRole("combobox", BOX)).toHaveValue("");

  await page.keyboard.press("Control+k");

  await expect(page.getByRole("combobox", BOX)).toBeFocused();
  await expect(page.getByRole("combobox", BOX)).toHaveValue("");
});

test("ctrl+K to a channel lands focus in its message box", async ({ page }) => {
  const { second } = await loggedIn(page, unique("browser-land-channel"));
  await jumped(page, second);

  await expect(page).toHaveURL(new RegExp(`#/channels/${second}$`, "u"));
  await expect(inPane(page).getByRole("textbox", MESSAGE_BOX)).toBeFocused();
});

test("ctrl+K to a person lands focus on the profile panel's heading", async ({ page }) => {
  await loggedIn(page, unique("browser-land-person"));
  const person = `${unique("browser-land-person")}-reader`;
  await jumped(page, person);

  await expect(page).toHaveURL(new RegExp(`#/people/${person}$`, "u"));
  await expect(profileHeading(page)).toBeFocused();
});

test("a new channel opens with focus in its message box", async ({ page }) => {
  await loggedIn(page, unique("browser-land-new"));
  const name = unique("browser-land-new-made");
  await inSidebar(page).getByRole("button", { exact: true, name: "New channel" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`#/channels/${name}$`, "u"));
  await expect(inPane(page).getByRole("textbox", MESSAGE_BOX)).toBeFocused();
});

test("on a narrow screen, a sidebar link closes the sidebar and lands focus on the view's heading", async ({
  page,
}) => {
  const { first } = await loggedIn(page, unique("browser-land-narrow"));
  await page.goto(`/#/channels/${first}`);
  await page.setViewportSize(NARROW);
  await inTopBar(page).getByRole("button", { exact: true, name: "Open the sidebar" }).press("Enter");
  await sidebarLink({ label: "Inbox", page }).press("Enter");

  await expect(inSidebar(page)).toBeHidden();
  await expect(heading(page)).toHaveText("Inbox");
  await expect(heading(page)).toBeFocused();
});

async function authorIn(page: Page, channel: string): Promise<string> {
  const author = `${channel}-author`;
  const { client } = await newIdentity({ kind: "human", name: author });
  await client.createMessage({ channel, text: "Card hello" });
  await page.goto(`/#/channels/${channel}`);
  return author;
}

test("view profile on an identity card lands focus on the profile panel's heading", async ({ page }) => {
  const { first } = await loggedIn(page, unique("browser-land-card"));
  const author = await authorIn(page, first);
  await page
    .getByRole("feed", { exact: true, name: "Messages" })
    .getByRole("link", { exact: true, name: author })
    .focus();

  await expect(page.getByRole("dialog")).toBeVisible();

  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");

  await expect(page.getByRole("dialog").getByRole("link", { exact: true, name: "View profile" })).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`#/people/${author}$`, "u"));
  await expect(profileHeading(page)).toBeFocused();
});
