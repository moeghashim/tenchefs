import { chose, pressed } from "./menus.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { openReading, otherThread, readAtLast, rowsAt, shown, threadToRead } from "./reading.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import type { ReadThread } from "./reading.ts";
import { inPane } from "./regions.ts";
import { subscribedReader } from "./inbox-reader.ts";
import { viewOpened } from "./view-opened.ts";

const ICON_FIRST = ':scope > svg[aria-hidden="true"]:first-child';
const MENU = "Inbox row actions";
const READ_AFTER = 2000;
const NONE = 0;
const TWO = 2;
const LAST = -1;

type Shown = readonly (readonly [string, boolean])[];

async function menuItems(name: string): Promise<Shown> {
  const shownMenu = await screen.findByRole("menu", { name });
  const items: (readonly [string, boolean])[] = [];
  for (const item of within(shownMenu).getAllByRole("menuitem")) {
    items.push([item.textContent, item.querySelector(ICON_FIRST) !== null]);
  }
  return items;
}

async function rowLink(href: string): Promise<HTMLElement> {
  const link = await waitFor(() => {
    const found = inPane().element().querySelector<HTMLElement>(`a[data-feed-row][href="${href}"]`);

    expect(found).not.toBeNull();

    return found ?? inPane().element();
  });
  return link;
}

async function moreActionsOf(href: string): Promise<HTMLElement> {
  const link = await rowLink(href);
  return within(link.closest("li") ?? link).getByRole("button", { name: "More actions" });
}

async function openHref(): Promise<string | null> {
  const item = await screen.findByRole("menuitem", { name: "Open in channel" });
  return item.getAttribute("href");
}

async function unreadIn(thread: ReadThread): Promise<number> {
  const inbox = await thread.reader.inbox();
  return inbox.items.filter((item) => item.message.kind === "reply" && item.parent.id === thread.parent.id).length;
}

async function latestReplyIn(thread: ReadThread): Promise<string> {
  const { replies } = await thread.reader.getThread(thread.parent.id);
  return replies.map((reply) => String(reply.id)).at(LAST) ?? "";
}

async function openHrefFor(href: string): Promise<string | null> {
  fireEvent.contextMenu(await rowLink(href));
  const shownHref = await openHref();
  fireEvent.keyDown(await screen.findByRole("menu", { name: MENU }), { key: "Escape" });
  await waitFor(() => {
    expect(screen.queryByRole("menu", { name: MENU })).toBeNull();
  });
  return shownHref;
}

async function chosenFrom(thread: ReadThread, name: string): Promise<Shown> {
  fireEvent.contextMenu(await rowLink(thread.address));
  const items = await menuItems(MENU);
  await chose(name);
  return items;
}

async function mentioned(channel: string): Promise<CookoutClient> {
  const { poster, reader } = await subscribedReader(channel);
  await poster.createMessage({ channel, text: `@${channel}-reader can you look?` });
  return reader;
}

it("right-clicking an unread Activity row opens its actions menu, every item with an icon", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await threadToRead("web-inbox-row-menu-right");
  const { close } = await viewOpened({ client: thread.reader, hash: "#/inbox", waitingOn: ["inbox"] });
  fireEvent.contextMenu(await rowLink(thread.address));

  await expect(menuItems(MENU)).resolves.toStrictEqual([
    ["Mark reade", true],
    ["Open in channelo", true],
  ]);

  close();
});

it("a For you row's More actions button opens the same menu", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-inbox-row-menu-more";
  const reader = await mentioned(channel);
  const { close } = await viewOpened({ client: reader, hash: "#/inbox", waitingOn: ["inbox"] });
  const button = await moreActionsOf(`#/inbox/${channel}`);
  pressed(() => button);

  await expect(menuItems("More actions")).resolves.toStrictEqual([
    ["Mark reade", true],
    ["Open in channelo", true],
  ]);

  close();
});

const KEYS = [
  ["the context-menu key", "ContextMenu", false],
  ["Shift+F10", "F10", true],
] as const;

it.each(KEYS)("%s on an Inbox row's link opens its actions menu", { timeout: 5000 }, async (_name, key, shiftKey) => {
  expect.hasAssertions();

  const thread = await threadToRead(`web-inbox-row-menu-key-${key.toLowerCase()}`);
  const { close } = await viewOpened({ client: thread.reader, hash: "#/inbox", waitingOn: ["inbox"] });
  fireEvent.keyDown(await rowLink(thread.address), { key, shiftKey });

  await expect(menuItems(MENU)).resolves.toHaveLength(TWO);

  close();
});

it("open in channel leads to a reply in its thread, and to a top-level message in its channel", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await threadToRead("web-inbox-row-menu-open");
  const { channel } = thread;
  await thread.poster.createMessage({ channel, text: "Top-level news" });
  const latest = await latestReplyIn(thread);
  const { close } = await viewOpened({ client: thread.reader, hash: "#/inbox", waitingOn: ["inbox"] });
  const reply = await openHrefFor(thread.address);

  expect([reply, await openHrefFor(`#/inbox/${channel}`)]).toStrictEqual([
    `#/channels/${channel}/threads/${String(thread.parent.id)}/messages/${latest}`,
    `#/channels/${channel}`,
  ]);

  close();
});

it("mark read on a row that isn't selected reads it and takes it out of its section", { timeout: 8000 }, async () => {
  expect.hasAssertions();

  const thread = await threadToRead("web-inbox-row-menu-read");
  const other = await otherThread(thread);
  const opened = await openReading({ hash: other.address, thread: other });
  fireEvent.contextMenu(await rowLink(thread.address));
  await chose("Mark read");
  await opened.answered("ack");
  const read = await readAtLast(thread);

  await waitFor(() => {
    expect([read, rowsAt({ label: "Activity", thread })]).toStrictEqual([NONE, []]);
  });

  await opened.close();
});

it("the selected row, once read, offers Mark unread, which brings it back and keeps it unread while selected", {
  timeout: 8000,
}, async () => {
  expect.hasAssertions();

  const thread = await threadToRead("web-inbox-row-menu-unread");
  const opened = await openReading({ hash: thread.address, thread });
  await opened.answered("getThread");
  await shown("Unread two in Deploy at noon?");
  await opened.readAfter(READ_AFTER);
  const items = await chosenFrom(thread, "Mark unread");
  await waitFor(async () => {
    await expect(unreadIn(thread)).resolves.toBe(TWO);
  });

  expect([items, await opened.unreadAfter(READ_AFTER)]).toStrictEqual([
    [
      ["Mark unreadu or Alt+Enter", true],
      ["Open in channelo", true],
    ],
    TWO,
  ]);

  await opened.close();
});
