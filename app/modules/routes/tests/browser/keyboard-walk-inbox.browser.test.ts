import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { hidden, walk } from "./key-walk.ts";
import { inConversation, inPane, inSidebar, inThread, sidebarLink } from "./regions.ts";
import type { CookoutClient } from "../../../sdk/index.ts";
import type { Step } from "./key-walk.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { testAgentDisplayName } from "../../../testing/index.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const EARLIER = 51;
const ONE = 1;
const PAD = 2;
const MENTIONED = "Mentioned you";
const REPLIED = "New reply in a thread you follow";
const EARLIER_ROW = "New in #";

interface Past {
  readonly author: string;
  readonly page: Page;
  readonly says: string;
}

interface Reading {
  readonly channel: string;
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
}

async function readEarlier(reading: Reading, left: number): Promise<void> {
  if (left < ONE) {
    return;
  }
  await readEarlier(reading, left - ONE);
  const { message } = await reading.poster.createMessage({
    channel: reading.channel,
    text: `Earlier ${String(left).padStart(PAD, "0")}.`,
  });
  await reading.reader.ack(message.id);
}

async function unread({ channel, poster, reader }: Reading): Promise<void> {
  const { message } = await poster.createMessage({ channel, text: "Deploy at noon?" });
  await reader.follow(message.id);
  await poster.createMessage({ channel, replyTo: message.id, text: "Noon works." });
  await poster.createMessage({ channel, text: `@${channel}-reader can you check?` });
}

function itemOf(page: Page, says: string): Locator {
  return inPane(page).getByRole("listitem").filter({ hasText: says });
}

function row(page: Page, says: string): Locator {
  return itemOf(page, says).locator("a[data-feed-row]");
}

function markAll(page: Page): Locator {
  return inPane(page).getByRole("button", { exact: true, name: "Mark all as read" });
}

function conversationButton(page: Page, name: string): Locator {
  return inConversation(page).getByRole("button", { exact: true, name });
}

async function opened(page: Page): Promise<string> {
  const channel = unique("kbwalk-inbox");
  await adminClient().createChannel({ name: channel });
  const poster = await newIdentity({ kind: "agent", name: `${channel}-poster` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await reader.client.subscribe(channel);
  const reading = { channel, poster: poster.client, reader: reader.client };
  await readEarlier(reading, EARLIER);
  await unread(reading);
  await logInWithStream({ page, token: reader.token, url: "/#/inbox" });
  return channel;
}

function onRows(page: Page): readonly Step[] {
  return [
    async () => {
      await expect(row(page, REPLIED)).toBeVisible();
    },
    ["Tab", inSidebar(page).getByRole("button", { exact: true, name: "Collapse sidebar" })],
    ["Control+]", row(page, MENTIONED)],
    ["Shift+Tab", markAll(page)],
    ["Tab", row(page, MENTIONED)],
  ];
}

function pastRow({ author, page, says }: Past): readonly Step[] {
  const item = itemOf(page, says);
  return [
    ["Tab", item.getByRole("link", { exact: true, name: author })],
    ["Tab", item.getByRole("button", { exact: true, name: "More actions" })],
  ];
}

function conversationWalk(page: Page): readonly Step[] {
  const thread = inConversation(page).getByRole("link", { exact: true, name: "Open thread" });
  const undo = conversationButton(page, "Undo");
  return [
    ["t", inConversation(page).getByRole("article", { exact: true, name: "First message" })],
    ["Shift+Tab", thread],
    ["Shift+Tab", conversationButton(page, "Mark unread")],
    ["Shift+Tab", conversationButton(page, "Mark conversation read")],
    ["Enter", conversationButton(page, "Mark conversation read")],
    ["Tab", conversationButton(page, "Mark unread")],
    ["Tab", thread],
    ["Tab", undo],
    ["Enter", conversationButton(page, "Mark unread")],
    hidden(undo),
  ];
}

test("every inbox row action and the conversation's buttons work by keys alone", async ({ page }) => {
  await opened(page);
  await walk({
    page,
    steps: [
      ...onRows(page),
      ["ArrowLeft", sidebarLink({ label: "Inbox", page })],
      ["ArrowRight", row(page, MENTIONED)],
      ["j", row(page, REPLIED)],
      ["k", row(page, MENTIONED)],
      ["Shift+F10", page.getByRole("menu").getByRole("menuitem", { exact: true, name: "Mark read" })],
      ["Escape", row(page, MENTIONED)],
      ["u", row(page, MENTIONED)],
      ["e", row(page, REPLIED)],
      ["r", inConversation(page).getByRole("textbox")],
      ["Escape", row(page, REPLIED)],
      ...conversationWalk(page),
      ["Control+[", row(page, REPLIED)],
    ],
  });
  await walk({ page, steps: [["o", inThread(page).getByRole("textbox", { exact: true, name: "Reply" })]] });

  await expect(inThread(page)).toBeVisible();
});

test("show earlier and mark all as read leave focus on a named button, never the body", async ({ page }) => {
  const author = testAgentDisplayName(`${await opened(page)}-poster`);
  const showEarlier = inPane(page).getByRole("button", { exact: true, name: "Show earlier" });
  await walk({
    page,
    steps: [
      ...onRows(page),
      ...pastRow({ author, page, says: MENTIONED }),
      ["Tab", row(page, REPLIED)],
      ...pastRow({ author, page, says: REPLIED }),
      ["Tab", row(page, EARLIER_ROW)],
      ["Tab", itemOf(page, EARLIER_ROW).getByRole("link", { exact: true, name: author })],
      ["Tab", showEarlier],
      ["Enter", markAll(page)],
      hidden(showEarlier),
      ["Enter", markAll(page)],
    ],
  });

  await expect(sidebarLink({ label: "Inbox", page })).toHaveAccessibleName("Inbox");
  await expect(markAll(page)).toHaveAttribute("aria-disabled", "true");
});
