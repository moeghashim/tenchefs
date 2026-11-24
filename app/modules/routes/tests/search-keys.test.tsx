import { expect, it, onTestFinished, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { idOf, postedIn } from "./feed.ts";
import { inSearchResults, inThread } from "./regions.ts";
import { openAt } from "./render.tsx";

const RESULTS = { name: "Search results" } as const;
const BOX = { name: "Search" } as const;
const BOTH = 2;

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
  const box = await screen.findByRole("searchbox", BOX);
  return box;
}

async function typed(query: string): Promise<void> {
  fireEvent.input(await searchBox(), { target: { value: query } });
  await inSearchResults().findByRole("link", { name: /Kudukey deploy/u });
}

function pressed(key: string, options: { readonly isComposing?: boolean } = {}): boolean {
  return fireEvent.keyDown(screen.getByRole("searchbox", BOX), { key, ...options });
}

function pressedAll(keys: readonly string[]): void {
  for (const key of keys) {
    pressed(key);
  }
}

function ignoredPresses(): void {
  const box = screen.getByRole("searchbox", BOX);
  pressed("Enter");
  fireEvent(box, new Event("keydown", { bubbles: true }));
  pressed("Enter", { isComposing: true });
}

function pressedOutside(): HTMLElement | null {
  fireEvent.pointerDown(globalThis.document.body);
  return screen.queryByRole("list", RESULTS);
}

it("ctrl+K and Cmd+K focus the search box from a message box, preventing the browser's own", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const opened = await openedOnThread("web-search-shortcut");
  const reply = await inThread().findByRole("textbox", { name: "Reply" });
  reply.focus();
  const ctrl = fireEvent.keyDown(reply, { ctrlKey: true, key: "k" });
  const focusedByCtrl = globalThis.document.activeElement === (await searchBox());
  reply.focus();
  const meta = fireEvent.keyDown(reply, { key: "K", metaKey: true });

  expect([ctrl, focusedByCtrl, meta, globalThis.document.activeElement]).toStrictEqual([
    false,
    true,
    false,
    await searchBox(),
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

  expect([handled, screen.queryByRole("list", RESULTS), globalThis.document.activeElement]).toStrictEqual([
    true,
    null,
    reply,
  ]);

  opened.close();
});

it("down, Up and Enter open the highlighted result; Enter with none highlighted, or mid-composition, does nothing", {
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
  const link = await inSearchResults().findByRole("link", { name: /Kudukey deploy/u });
  const box = screen.getByRole("searchbox", BOX);
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
    inSearchResults().getAllByRole("link", { name: /Kudukey/u }).length,
    screen.getByRole("searchbox", BOX),
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
  const reopened = await screen.findByRole("list", RESULTS);
  pressed("Escape");

  expect([closed, reopened.isConnected, globalThis.document.activeElement === box]).toStrictEqual([null, false, false]);

  opened.close();
});
