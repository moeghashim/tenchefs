import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inThread, sidebarLink } from "./regions.ts";
import type { MessageId } from "../../../sdk/index.ts";
import type { Person } from "./people.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const WIDE = { height: 700, width: 1280 };
const NONE = 0;
const UNKEYED = '[role="menuitem"]:not([aria-keyshortcuts]), [role="menuitem"][aria-keyshortcuts=""]';
const KEYED = '[role="menuitem"] kbd:not(:empty)';

interface Board {
  readonly channel: string;
  readonly author: string;
  readonly parent: MessageId;
  readonly reader: Person;
}

async function board(channel: string): Promise<Board> {
  await adminClient().createChannel({ name: channel });
  const author = `${channel}-poster`;
  const poster = await newIdentity({ kind: "human", name: author });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await reader.client.subscribe(channel);
  const { message: parent } = await poster.client.createMessage({ channel, text: "Deploy at noon?" });
  await reader.client.follow(parent.id);
  await poster.client.createMessage({ channel, replyTo: parent.id, text: "Anyone around?" });
  await reader.client.createMessage({ channel, text: "My own note" });
  return { author, channel, parent: parent.id, reader };
}

async function opened(page: Page, { reader }: Board, url: string): Promise<void> {
  await page.setViewportSize(WIDE);
  await logInWithStream({ page, token: reader.token });
  await page.goto(url);
}

async function everyChoiceKeyed(menu: Locator): Promise<void> {
  const choices = menu.getByRole("menuitem");

  await expect(choices.first()).toBeVisible();

  const shown = await choices.count();

  await expect(menu.locator(UNKEYED)).toHaveCount(NONE);
  await expect(menu.locator(KEYED)).toHaveCount(shown);
}

function messageNamed(page: Page, text: string): Locator {
  return page.getByRole("feed", { exact: true, name: "Messages" }).getByRole("article").filter({ hasText: text });
}

test("every choice in a message's menu shows its key", async ({ page }) => {
  const shown = await board(unique("browser-menu-keys-message"));
  await opened(page, shown, `/#/channels/${shown.channel}`);
  await messageNamed(page, "My own note").click({ button: "right" });

  await everyChoiceKeyed(page.getByRole("menu", { exact: true, name: "Message actions" }));
});

test("every choice in a thread header's menu shows its key", async ({ page }) => {
  const shown = await board(unique("browser-menu-keys-thread"));
  await opened(page, shown, `/#/channels/${shown.channel}/threads/${String(shown.parent)}`);
  await inThread(page).getByRole("heading", { exact: true, name: "Thread" }).click({ button: "right" });

  await everyChoiceKeyed(page.getByRole("menu", { exact: true, name: "Thread actions" }));
});

test("every choice in a channel row's menu shows its key", async ({ page }) => {
  const shown = await board(unique("browser-menu-keys-channel"));
  await opened(page, shown, `/#/channels/${shown.channel}`);
  await sidebarLink({ label: `#${shown.channel}`, page }).click({ button: "right" });

  await everyChoiceKeyed(page.getByRole("menu", { exact: true, name: `#${shown.channel} actions` }));
});

test("every choice in an Inbox row's menu shows its key", async ({ page }) => {
  const shown = await board(unique("browser-menu-keys-inbox"));
  await opened(page, shown, "/#/inbox");
  await inPane(page)
    .locator(`a[data-feed-row][href^="#/inbox/${shown.channel}/${String(shown.parent)}/"]`)
    .click({ button: "right" });

  await everyChoiceKeyed(page.getByRole("menu", { exact: true, name: "Inbox row actions" }));
});

test("every choice in a person's menu shows its key", async ({ page }) => {
  const shown = await board(unique("browser-menu-keys-person"));
  await opened(page, shown, `/#/channels/${shown.channel}`);
  await page
    .getByRole("feed", { exact: true, name: "Messages" })
    .getByRole("link", { exact: true, name: shown.author })
    .click({ button: "right" });

  await everyChoiceKeyed(page.getByRole("menu", { exact: true, name: `@${shown.author} actions` }));
});
