import type { ClockFixtures, ClockOptions, OwnCookout } from "./clock.ts";
import type { Locator, Page } from "@playwright/test";
import { test as base, expect } from "@playwright/test";
import { inSidebar, sidebarLink } from "./regions.ts";
import { said, walk } from "./key-walk.ts";
import type { Step } from "./key-walk.ts";
import { clockFixtures } from "./clock.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures).extend<ClockFixtures & ClockOptions>(clockFixtures);

const DOWN = "ArrowDown";
const UP = "ArrowUp";

interface Named {
  readonly page: Page;
  readonly role: "button" | "link" | "separator";
  readonly name: string;
}

interface SigningIn {
  readonly name: string;
  readonly ownCookout: OwnCookout;
  readonly page: Page;
}

function named({ name, page, role }: Named): Locator {
  return inSidebar(page).getByRole(role, { exact: true, name });
}

function button(page: Page, name: string): Locator {
  return named({ name, page, role: "button" });
}

function edgeOf(page: Page): Locator {
  return named({ name: "Resize the sidebar", page, role: "separator" });
}

async function signedIn({ name, ownCookout, page }: SigningIn): Promise<string> {
  const channel = unique(name);
  await ownCookout.admin.createChannel({ name: channel });
  const reader = await ownCookout.newIdentity({ kind: "human", name: `${channel}-reader` });
  await reader.client.subscribe(channel);
  await ownCookout.admin.createMessage({ channel, text: "Something unread." });
  await logInWithStream({ page, token: reader.token, url: "/#/inbox" });

  await expect(sidebarLink({ label: "Inbox", page })).toHaveAttribute("aria-current", "page");

  return channel;
}

async function edgeMoved(page: Page): Promise<void> {
  const edge = edgeOf(page);
  const steps: readonly Step[] = [
    ["Tab", sidebarLink({ label: "Inbox", page })],
    ["Tab", button(page, "New channel")],
    ["Tab", edge],
  ];
  await walk({ page, steps });
  const width = await edge.getAttribute("aria-valuenow");
  await walk({ page, steps: [["ArrowRight", edge]] });

  await expect(edge).not.toHaveAttribute("aria-valuenow", width ?? "");
}

test("every sidebar link, the new channel form and the sidebar's edge work by keys alone", async ({
  ownCookout,
  page,
}) => {
  const channel = await signedIn({ name: "kbwalk-sidebar", ownCookout, page });
  const row = sidebarLink({ label: `#${channel}`, page });
  const person = sidebarLink({ label: `${channel}-reader`, page });
  const form = page.getByRole("form", { exact: true, name: "New channel" });
  await walk({
    page,
    steps: [
      ["Tab", button(page, "Collapse sidebar")],
      ["Tab", sidebarLink({ label: "Inbox", page })],
      [UP, named({ name: "cookout", page, role: "link" })],
      [DOWN, sidebarLink({ label: "Inbox", page })],
      [DOWN, named({ name: "People & agents", page, role: "link" })],
      [DOWN, row],
      [DOWN, person],
      [DOWN, named({ name: "Settings", page, role: "link" })],
      [UP, person],
      [UP, row],
      ["Shift+Tab", button(page, "New channel")],
      ["Enter", form.getByRole("textbox", { exact: true, name: "Name" })],
      ["Escape", button(page, "New channel")],
      ["Shift+Tab", button(page, "Collapse sidebar")],
      ["Enter", button(page, "Expand sidebar")],
      ["Enter", button(page, "Collapse sidebar")],
    ],
  });
  await edgeMoved(page);

  await expect(form).toBeHidden();
});

test("every channel row action works by keys alone, and its menu and dialog give focus back", async ({
  ownCookout,
  page,
}) => {
  const channel = await signedIn({ name: "kbwalk-row", ownCookout, page });
  const row = sidebarLink({ label: `#${channel}`, page });
  const menu = page.getByRole("menu", { exact: true, name: `#${channel} actions` });
  const schedules = page.getByRole("dialog", { exact: true, name: "Scheduled messages" });
  await walk({
    page,
    steps: [
      ["Tab", button(page, "Collapse sidebar")],
      ["Tab", sidebarLink({ label: "Inbox", page })],
      [DOWN, named({ name: "People & agents", page, role: "link" })],
      [DOWN, row],
      ["Shift+F10", menu.getByRole("menuitem").first()],
      async (): Promise<void> => {
        await expect(menu.getByRole("menuitem")).toHaveText([
          /^Mark all as read/u,
          /^Unsubscribe/u,
          /^Scheduled messages/u,
        ]);
      },
      ["Escape", row],
      ["e", row],
      async (): Promise<void> => {
        await expect(row).toHaveAccessibleName(`#${channel}`);
      },
      ["s", row],
      async (): Promise<void> => {
        await expect(said({ page, text: "Unsubscribed" })).toBeAttached();
      },
      ["s", row],
      async (): Promise<void> => {
        await expect(said({ page, text: "Subscribed" })).toBeAttached();
      },
      ["Shift+S", schedules.getByRole("button", { exact: true, name: "Close" })],
      ["Escape", row],
    ],
  });

  await expect(schedules).toBeHidden();
});
