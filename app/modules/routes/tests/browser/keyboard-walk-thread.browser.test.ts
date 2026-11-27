import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { announced, feedMessage, shown, typing, walk } from "./key-walk.ts";
import { test as base, expect } from "@playwright/test";
import { inSidebar, inThread } from "./regions.ts";
import type { Step } from "./key-walk.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { testAgentDisplayName } from "../../../testing/index.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const PARENT = "The parent.";
const REPLY = "A reply by keys";

interface Named {
  readonly page: Page;
  readonly role: "button" | "heading" | "link" | "separator" | "textbox";
  readonly name: string;
}

async function opened(page: Page): Promise<string> {
  const channel = unique("kbwalk-thread");
  await adminClient().createChannel({ name: channel });
  const poster = await newIdentity({ kind: "agent", name: `${channel}-poster` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await reader.client.subscribe(channel);
  const { message } = await poster.client.createMessage({ channel, text: PARENT });
  await poster.client.createMessage({ channel, replyTo: message.id, text: "An answer." });
  await poster.client.createMessage({ channel, text: "Later topic." });
  await logInWithStream({ page, token: reader.token, url: `/#/channels/${channel}` });
  return channel;
}

function named({ name, page, role }: Named): Locator {
  return inThread(page).getByRole(role, { exact: true, name });
}

function button(page: Page, name: string): Locator {
  return named({ name, page, role: "button" });
}

function link(page: Page, name: string): Locator {
  return named({ name, page, role: "link" });
}

function replyBox(page: Page): Locator {
  return named({ name: "Reply", page, role: "textbox" });
}

function replied(page: Page, channel: string): readonly Step[] {
  const parent = feedMessage({ page, text: PARENT });
  return [
    shown(feedMessage({ page, text: "Later topic." })),
    ["Tab", inSidebar(page).getByRole("button", { exact: true, name: "Collapse sidebar" })],
    ["Control+]", feedMessage({ page, text: "Later topic." })],
    ["k", parent],
    ["Enter", replyBox(page)],
    async () => {
      await expect(replyBox(page)).toHaveValue(`@${channel}-poster `);
    },
    typing({ into: replyBox(page), page, text: REPLY }),
    ["Enter", replyBox(page)],
    async () => {
      await expect(inThread(page).getByRole("article").filter({ hasText: REPLY })).toBeVisible();
      await expect(replyBox(page)).toHaveValue("");
    },
  ];
}

function onHeading(page: Page, channel: string): readonly Step[] {
  const parent = inThread(page).getByRole("article", { exact: true, name: "Parent message" });
  return [
    ["ArrowUp", inThread(page).getByRole("article").filter({ hasText: REPLY })],
    ["Shift+Tab", parent.locator("time")],
    ["Shift+Tab", parent.getByRole("link", { exact: true, name: testAgentDisplayName(`${channel}-poster`) })],
    ["Shift+Tab", button(page, "Close thread")],
    ["Shift+Tab", link(page, "Open thread on its own")],
    ["Shift+Tab", link(page, "Close panel")],
    ["Shift+Tab", button(page, "Add title")],
    ["Shift+Tab", named({ name: "Thread", page, role: "heading" })],
  ];
}

test("replying in a thread and leaving it work by keys alone", async ({ page }) => {
  const channel = await opened(page);
  const parent = feedMessage({ page, text: PARENT });
  await walk({
    page,
    steps: [
      ...replied(page, channel),
      ["Escape", parent],
      ["Control+]", replyBox(page)],
      ...onHeading(page, channel),
      ["Tab", button(page, "More actions")],
      ["Tab", button(page, "Add title")],
      ["Tab", link(page, "Close panel")],
      ["Tab", link(page, "Open thread on its own")],
      ["Tab", button(page, "Close thread")],
      ["Enter", button(page, "Reopen thread")],
      ["Enter", button(page, "Close thread")],
      ["Escape", button(page, "Close thread")],
      ["Escape", parent],
    ],
  });

  await expect(inThread(page)).toBeHidden();
});

test("the thread header's menus and the thread panel's edge work by keys alone", async ({ page }) => {
  const channel = await opened(page);
  const heading = named({ name: "Thread", page, role: "heading" });
  const actions = page.getByRole("menu", { exact: true, name: "Thread actions" });
  const more = button(page, "More actions");
  const edge = named({ name: "Resize the thread panel", page, role: "separator" });
  await walk({
    page,
    steps: [
      ...replied(page, channel),
      ...onHeading(page, channel),
      ["Shift+F10", actions.getByRole("menuitem").first()],
      ["Escape", heading],
      ["Shift+F10", actions.getByRole("menuitem", { exact: true, name: "Close" })],
      ["Enter", heading],
      announced({ page, text: "Thread closed" }),
      ["Shift+F10", actions.getByRole("menuitem", { exact: true, name: "Reopen" })],
      ["Enter", heading],
      announced({ page, text: "Thread reopened" }),
      ["Tab", more],
      ["Enter", page.getByRole("menu", { exact: true, name: "More actions" }).getByRole("menuitem").first()],
      ["Escape", more],
      ["Shift+Tab", heading],
      ["Shift+Tab", edge],
    ],
  });
  const width = await edge.getAttribute("aria-valuenow");
  await walk({ page, steps: [["ArrowLeft", edge]] });

  await expect(edge).not.toHaveAttribute("aria-valuenow", width ?? "");
});
