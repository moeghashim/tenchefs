import { expect, it, onTestFinished, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { idOf, postedIn } from "./feed.ts";
import { inSearchResults, inThread } from "./regions.ts";
import { adminClient } from "./identities.ts";
import { openAt } from "./render.tsx";

const RESULTS = { name: "Search results" } as const;
const BOX = { name: "Search" } as const;
const BOTH = 2;
const ONE = 1;

interface Opened {
  readonly close: () => void;
  readonly thread: string;
}

function scrollingIntoView(): void {
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn<() => void>() });
  onTestFinished(() => {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });
}

async function openedOnThread(channel: string): Promise<Opened> {
  scrollingIntoView();
  const posted = await postedIn({ channel, closed: [], texts: [`Kudukey deploy ${channel}`] });
  const parent = idOf({ posted, text: `Kudukey deploy ${channel}` });
  await posted.poster.createMessage({ channel, replyTo: parent, text: `Kudukey noon ${channel}` });
  const thread = `#/channels/${channel}/threads/${String(parent)}`;
  const close = openAt({ client: posted.reader, hash: thread });
  await inThread().findByText(`Kudukey noon ${channel}`);
  return { close, thread };
}

async function searchBox(): Promise<HTMLElement> {
  const box = await screen.findByRole("combobox", BOX);
  return box;
}

async function typed(query: string): Promise<void> {
  fireEvent.input(await searchBox(), { target: { value: query } });
  await inSearchResults().findByRole("option", { name: /Kudukey deploy/u });
}

function pressed(key: string, options: { readonly isComposing?: boolean } = {}): boolean {
  return fireEvent.keyDown(screen.getByRole("combobox", BOX), { key, ...options });
}

function pressedAll(keys: readonly string[]): void {
  for (const key of keys) {
    pressed(key);
  }
}

function ignoredPresses(): void {
  const box = screen.getByRole("combobox", BOX);
  fireEvent(box, new Event("keydown", { bubbles: true }));
  pressed("Enter", { isComposing: true });
}

function pressedOutside(): HTMLElement | null {
  fireEvent.pointerDown(globalThis.document.body);
  return screen.queryByRole("listbox", RESULTS);
}

it("off a Mac, Ctrl+K focuses the search box from a message box, preventing the browser's own, and Cmd+K doesn't", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const opened = await openedOnThread("web-search-shortcut");
  const reply = await inThread().findByRole("textbox", { name: "Reply" });
  reply.focus();
  const meta = fireEvent.keyDown(reply, { key: "K", metaKey: true });
  const focusedByMeta = globalThis.document.activeElement === reply;
  const ctrl = fireEvent.keyDown(reply, { ctrlKey: true, key: "k" });

  expect([meta, focusedByMeta, ctrl, globalThis.document.activeElement]).toStrictEqual([
    true,
    true,
    false,
    await searchBox(),
  ]);

  opened.close();
});

it("on a Mac, the search box names ⌘K in its placeholder and aria-keyshortcuts", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const platform = vi.spyOn(globalThis.navigator, "platform", "get").mockReturnValue("MacIntel");
  onTestFinished(() => {
    platform.mockRestore();
  });
  const opened = await openedOnThread("web-search-mac");
  const box = await searchBox();

  expect([box.getAttribute("placeholder"), box.getAttribute("aria-keyshortcuts")]).toStrictEqual([
    "Go to or search (⌘K)",
    "Meta+K",
  ]);

  opened.close();
});

it("escape closes the list and gives focus back to the message box it came from", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const opened = await openedOnThread("web-search-escape");
  const reply = await inThread().findByRole("textbox", { name: "Reply" });
  reply.focus();
  fireEvent.keyDown(reply, { ctrlKey: true, key: "k" });
  await typed("kudukey web search escape");
  const handled = !pressed("Escape");

  expect([handled, screen.queryByRole("listbox", RESULTS), globalThis.document.activeElement]).toStrictEqual([
    true,
    null,
    reply,
  ]);

  opened.close();
});

it("down, Up and Enter open the highlighted result; a key without a key, or Enter mid-composition, does nothing", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const opened = await openedOnThread("web-search-enter");
  await typed("kudukey web search enter");
  ignoredPresses();
  const before = globalThis.location.hash;
  pressedAll(["ArrowDown", "ArrowDown", "ArrowUp", "Enter"]);

  expect(before).toBe(opened.thread);

  await vi.waitFor(() => {
    expect(globalThis.location.hash).toMatch(new RegExp(`^${opened.thread}/messages/\\d+$`, "u"));
  });

  opened.close();
});

async function focusedFromNowhere(): Promise<HTMLElement> {
  const box = await searchBox();
  box.focus();
  box.blur();
  fireEvent.focusIn(box);
  return box;
}

async function touchedInside(): Promise<void> {
  const link = await inSearchResults().findByRole("option", { name: /Kudukey deploy/u });
  const box = screen.getByRole("combobox", BOX);
  link.focus();
  fireEvent.pointerDown(box);
  fireEvent.click(box);
  fireEvent.click(globalThis.document.body);
  fireEvent.scroll(globalThis.document);
  fireEvent.scroll(globalThis.document.body);
}

it("focusing a result, pressing or clicking in the box, and scrolling or typing elsewhere keep the list as it is", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const opened = await openedOnThread("web-search-inside");
  const reply = await inThread().findByRole("textbox", { name: "Reply" });
  await typed("kudukey web search inside");
  await touchedInside();
  fireEvent.input(reply, { target: { value: "Elsewhere" } });

  expect([
    inSearchResults().getAllByRole("option", { name: /Kudukey/u }).length,
    screen.getByRole("combobox", BOX),
  ]).toStrictEqual([BOTH, expect.objectContaining({ value: "kudukey web search inside" })]);

  opened.close();
});

it("pressing outside closes the list, focusing the box opens it again, and Escape then just leaves the box", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const opened = await openedOnThread("web-search-outside");
  await typed("kudukey web search outside");
  const closed = pressedOutside();
  const box = await focusedFromNowhere();
  const reopened = await screen.findByRole("listbox", RESULTS);
  pressed("Escape");

  expect([closed, reopened.isConnected, globalThis.document.activeElement === box]).toStrictEqual([null, false, false]);

  opened.close();
});

function activeOptionName(): string | null {
  const box = screen.getByRole("combobox", BOX);
  const active = box.getAttribute("aria-activedescendant") ?? "";
  const option = globalThis.document.querySelector(`[id="${active}"][aria-selected="true"]`);
  if (option === null) {
    return null;
  }
  return option.textContent;
}

interface Combobox {
  readonly controls: boolean;
  readonly expanded: string | null;
  readonly groups: readonly (string | null)[];
}

async function comboboxOpened(): Promise<Combobox> {
  const box = await searchBox();
  box.focus();
  const listbox = await screen.findByRole("listbox", RESULTS);
  const groups: (string | null)[] = [];
  for (const group of inSearchResults().getAllByRole("group")) {
    groups.push(group.getAttribute("aria-label"));
  }
  return {
    controls: box.getAttribute("aria-controls") === listbox.id,
    expanded: box.getAttribute("aria-expanded"),
    groups,
  };
}

it("the box is a combobox controlling a listbox of named groups, its active option following Down and Up", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const opened = await openedOnThread("web-search-combobox");
  const combobox = await comboboxOpened();
  const first = activeOptionName();
  pressed("ArrowDown");
  const second = activeOptionName();
  pressed("ArrowUp");

  expect(combobox).toStrictEqual({ controls: true, expanded: "true", groups: ["Places"] });
  expect([first, second, activeOptionName()]).toStrictEqual(["Inbox", "People", "Inbox"]);

  opened.close();
});

function optionTexts(group: string): readonly string[] {
  const texts: string[] = [];
  for (const option of within(inSearchResults().getByRole("group", { name: group })).getAllByRole("option")) {
    texts.push(option.textContent);
  }
  return texts;
}

async function jumpsFor(query: string): Promise<readonly (readonly string[])[]> {
  fireEvent.input(await searchBox(), { target: { value: query } });
  await inSearchResults().findByRole("group", { name: "People" });
  return [optionTexts("Channels"), optionTexts("People")];
}

async function byDisplayName(): Promise<readonly string[]> {
  fireEvent.input(await searchBox(), { target: { value: "jumpsworth" } });
  return vi.waitFor(() => {
    const people = optionTexts("People");

    expect(people).toHaveLength(ONE);

    return people;
  });
}

it("typing lists the channels and people whose name or Display name holds it, and pressing one opens it", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const posted = await postedIn({ channel: "web-search-jumps", closed: [], texts: ["Hello"] });
  await adminClient().setDisplayName("web-search-jumps-ada", "Ada Jumpsworth");
  const close = openAt({ client: posted.reader, hash: "#/inbox" });
  const byName = await jumpsFor("WEB-SEARCH-JUMPS");
  const named = await byDisplayName();
  fireEvent.input(await searchBox(), { target: { value: "web-search-jumps" } });
  fireEvent.mouseDown(await inSearchResults().findByRole("option", { name: "#web-search-jumps" }));

  expect([byName, named, globalThis.location.hash, screen.queryByRole("listbox", RESULTS)]).toStrictEqual([
    [["#web-search-jumps"], ["Ada Jumpsworthweb-search-jumps-ada", "web-search-jumps-grace"]],
    ["Ada Jumpsworthweb-search-jumps-ada"],
    "#/channels/web-search-jumps",
    null,
  ]);

  close();
});
