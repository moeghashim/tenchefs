import type { CookoutClient, MessageId } from "../../sdk/index.ts";
import { chose, pressed } from "./menus.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Mock } from "vitest";
import { inThread } from "./regions.ts";
import { openAt } from "./render.tsx";
import { subscribedReader } from "./inbox-reader.ts";

const ICON_FIRST = ':scope > svg[aria-hidden="true"]:first-child';
const MENU = "Thread actions";
const NONE = 0;

type Shown = readonly (readonly [string, boolean])[];

interface OpenThread {
  readonly reader: CookoutClient;
  readonly parent: MessageId;
  readonly hash: string;
  readonly close: () => void;
}

async function openThread(channel: string): Promise<OpenThread> {
  const { poster, reader } = await subscribedReader(channel);
  const { message } = await poster.createMessage({ channel, text: "Deploy?" });
  await poster.createMessage({ channel, replyTo: message.id, text: "Noon works." });
  const hash = `#/channels/${channel}/threads/${String(message.id)}`;
  const close = openAt({ client: reader, hash });
  await inThread().findByText("Noon works.");
  await inThread().findEnabledButton("Close thread");
  return { close, hash, parent: message.id, reader };
}

function header(): HTMLElement {
  const found = inThread().element().querySelector("header");
  if (found === null) {
    throw new TypeError("The thread panel has no header");
  }
  return found;
}

function headerMoreActions(): HTMLElement {
  return within(header()).getByRole("button", { name: "More actions" });
}

async function menuItems(name: string): Promise<Shown> {
  const shown = await screen.findByRole("menu", { name });
  const items: (readonly [string, boolean])[] = [];
  for (const item of within(shown).getAllByRole("menuitem")) {
    items.push([item.textContent, item.querySelector(ICON_FIRST) !== null]);
  }
  return items;
}

async function chooseFromHeader(name: string): Promise<void> {
  fireEvent.contextMenu(within(header()).getByRole("heading", { name: "Thread" }));
  await chose(name);
}

async function closedByOf(reader: CookoutClient, parent: MessageId): Promise<string | null> {
  const thread = await reader.getThread(parent);
  return thread.parent.closedBy ?? null;
}

function stubClipboard(): Mock<(text: string) => Promise<void>> {
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => {
    await Promise.resolve();
  });
  Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: { writeText } });
  onTestFinished(() => {
    Reflect.deleteProperty(globalThis.navigator, "clipboard");
  });
  return writeText;
}

it("right-clicking a thread's header opens its actions menu, every item with an icon", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close } = await openThread("web-thread-menu-right");
  fireEvent.contextMenu(within(header()).getByRole("heading", { name: "Thread" }));

  await expect(menuItems(MENU)).resolves.toStrictEqual([
    ["Close", true],
    ["Mark unread", true],
    ["Copy link", true],
  ]);

  close();
});

it("a thread header's More actions button opens the same menu", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close } = await openThread("web-thread-menu-more");
  pressed(headerMoreActions);

  await expect(menuItems("More actions")).resolves.toStrictEqual([
    ["Close", true],
    ["Mark unread", true],
    ["Copy link", true],
  ]);

  close();
});

const KEYS = [
  ["the context-menu key", "ContextMenu", false],
  ["Shift+F10", "F10", true],
] as const;

const THREE_ITEMS = 3;

it.each(KEYS)(
  "%s on a thread's focused header opens its actions menu",
  { timeout: 5000 },
  async (_name, key, shiftKey) => {
    expect.hasAssertions();

    const { close } = await openThread(`web-thread-menu-key-${key.toLowerCase()}`);
    const heading = within(header()).getByRole("heading", { name: "Thread" });
    heading.focus();
    fireEvent.keyDown(heading, { key, shiftKey });

    await expect(menuItems(MENU)).resolves.toHaveLength(THREE_ITEMS);

    close();
  },
);

it("close in a thread header's menu closes the thread, and Reopen there reopens it", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const { close, parent, reader } = await openThread("web-thread-menu-close");
  await chooseFromHeader("Close");
  await inThread().findEnabledButton("Reopen thread");
  const closedBy = await closedByOf(reader, parent);
  await chooseFromHeader("Reopen");
  await inThread().findEnabledButton("Close thread");

  expect([closedBy, await closedByOf(reader, parent)]).toStrictEqual([expect.stringMatching(/-reader$/u), null]);

  close();
});

it("mark unread in a thread header's menu marks the thread's parent unread, back in the Inbox", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const { close, reader } = await openThread("web-thread-menu-unread");
  await vi.waitUntil(async () => {
    const { items } = await reader.inbox();
    return items.length === NONE;
  });
  await chooseFromHeader("Mark unread");

  await waitFor(async () => {
    const { items } = await reader.inbox();

    expect(items.map((item) => item.message.text)).toContain("Deploy?");
  });

  close();
});

it("copy link in a thread header's menu puts the thread's full URL on the clipboard", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const writeText = stubClipboard();
  const { close, hash } = await openThread("web-thread-menu-copy");
  await chooseFromHeader("Copy link");

  await waitFor(() => {
    expect(writeText.mock.calls).toStrictEqual([[new URL(hash, globalThis.location.href).href]]);
  });

  close();
});
