import { adminClient, newIdentity } from "./identities.ts";
import { chose, pressed } from "./menus.ts";
import { expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { CookoutClient } from "../../sdk/index.ts";
import { alertSaying } from "./alerts.ts";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";
import { streamOf } from "./messages.ts";

const NONE = 0;

interface Posting {
  readonly channel: string;
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
}

async function readerOf(channel: string): Promise<Posting> {
  const poster = await newIdentity({ kind: "human", name: `${channel}-ada` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-grace` });
  await adminClient().createChannel({ name: channel });
  await reader.client.subscribe(channel);
  return { channel, poster: poster.client, reader: reader.client };
}

async function inboxEmptied(client: CookoutClient): Promise<void> {
  await vi.waitUntil(async () => {
    const inbox = await client.inbox();
    return inbox.items.length === NONE;
  });
}

async function openedAs(reader: CookoutClient, hash: string, text: string): Promise<() => void> {
  const close = openAt({ client: reader, hash });
  await screen.findByText(text);
  await inboxEmptied(reader);
  return close;
}

async function streamShows(label: string, rows: readonly string[]): Promise<void> {
  await vi.waitFor(async () => {
    const shown = await streamOf(label);

    expect(shown.filter((row) => row === "[New]" || !row.startsWith("["))).toStrictEqual(rows);
  });
}

async function channelRead(channel: string): Promise<() => void> {
  const { poster, reader } = await readerOf(channel);
  await poster.createMessage({ channel, text: "First" });
  await poster.createMessage({ channel, text: "Second" });
  await poster.createMessage({ channel, text: "Third" });
  return openedAs(reader, `#/channels/${channel}`, "Third");
}

async function threadRead(channel: string): Promise<() => void> {
  const { poster, reader } = await readerOf(channel);
  const { message: parent } = await reader.createMessage({ channel, text: "Deploy?" });
  await poster.createMessage({ channel, replyTo: parent.id, text: "Noon works" });
  await poster.createMessage({ channel, replyTo: parent.id, text: "Or one" });
  return openedAs(reader, `#/channels/${channel}/threads/${String(parent.id)}`, "Or one");
}

async function firstMoreActions(list: string): Promise<HTMLElement> {
  const [first] = within(await screen.findByRole("feed", { name: list })).getAllByRole("button", {
    name: "More actions",
  });
  if (!(first instanceof HTMLElement)) {
    throw new TypeError("No More actions button");
  }
  return first;
}

async function markedUnread(): Promise<void> {
  await chose("Mark unread");
}

it('right-clicking a message and choosing Mark unread moves "New" above it and puts it back in the Inbox', {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-mark-unread";
  const close = await channelRead(channel);

  fireEvent.contextMenu(screen.getByText("Second"));
  await markedUnread();
  await streamShows("Messages", [`${channel}-adaFirst`, "[New]", `${channel}-adaSecond`, "Third"]);
  globalThis.location.hash = "#/inbox";
  const [second, third] = await Promise.all([inPane().findByText("Second"), inPane().findByText("Third")]);

  expect([second.textContent, third.textContent]).toStrictEqual(["Second", "Third"]);

  close();
});

it("marking a channel's first message unread puts the New line above it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-mark-unread-first";
  const close = await channelRead(channel);

  fireEvent.contextMenu(screen.getByText("First"));
  await markedUnread();
  await streamShows("Messages", ["[New]", `${channel}-adaFirst`, "Second", "Third"]);

  close();
});

it("a refused Mark unread says why", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-mark-unread-refused";
  const close = await channelRead(channel);
  await adminClient().deleteChannel(channel);

  fireEvent.contextMenu(screen.getByText("Second"));
  await markedUnread();
  const alert = await alertSaying("Couldn't mark the message unread");

  expect([alert.textContent, screen.queryAllByRole("menu")]).toStrictEqual([
    expect.stringMatching(/^Couldn't mark the message unread \(message_not_found\)/u),
    [],
  ]);

  close();
});

it("the More actions button marks a reply unread, moving the thread's New line above it", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-mark-unread-thread";
  const close = await threadRead(channel);
  const first = await firstMoreActions("Replies");

  pressed(() => first);
  await markedUnread();
  await streamShows("Replies", ["[New]", `${channel}-adaNoon works`, "Or one"]);

  expect(screen.queryAllByRole("menu")).toStrictEqual([]);

  close();
});

it("escape closes a message's actions menu, and so does its More actions button", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await channelRead("web-mark-unread-close");
  const first = await firstMoreActions("Messages");
  pressed(() => first);
  fireEvent.keyDown(await screen.findByRole("menu", { name: "More actions" }), { key: "Escape" });
  const afterEscape = screen.queryAllByRole("menu");
  pressed(() => first);
  pressed(() => first);

  expect([afterEscape, screen.queryAllByRole("menu")]).toStrictEqual([[], []]);

  close();
});
