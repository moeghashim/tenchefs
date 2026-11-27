import { expect, it, onTestFinished, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { chose } from "./menus.ts";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";
import { postedIn } from "./feed.ts";

const MARKDOWN = "**Ship it** with `pnpm check`.";
const SHOWN = "Ship it";
const MAIN_BUTTON = 0;
const SECONDARY_BUTTON = 2;

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

function selected(element: unknown): void {
  const selection = globalThis.getSelection();
  if (selection === null || !(element instanceof Node)) {
    throw new Error("No selection");
  }
  const range = globalThis.document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
  onTestFinished(() => {
    selection.removeAllRanges();
  });
}

async function shownIn(channel: string): Promise<{ readonly close: () => void; readonly text: HTMLElement }> {
  const posted = await postedIn({ channel, closed: [], texts: [MARKDOWN] });
  const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}` });
  const text = await inPane().findByText(SHOWN);
  return { close, text };
}

it("copy text copies the message's Markdown and says Text copied", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const writeText = stubClipboard();
  const { close, text } = await shownIn("web-copy-text-menu");
  fireEvent.contextMenu(text);
  await chose("Copy text");

  await waitFor(() => {
    expect(screen.getByRole("status", { name: "Announcements" })).toHaveProperty("textContent", "Text copied");
  });

  expect(writeText).toHaveBeenCalledWith(MARKDOWN);

  close();
});

it("a right-click on a message with text selected in it opens no menu and keeps the browser's", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, text } = await shownIn("web-copy-text-selected");
  selected(text);
  fireEvent.mouseDown(text, { button: SECONDARY_BUTTON });
  const browserMenu = fireEvent.contextMenu(text, { button: SECONDARY_BUTTON });

  expect([browserMenu, screen.queryByRole("menu")]).toStrictEqual([true, null]);

  close();
});

it("a Control-click that selects the word under the pointer still opens the message's menu", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, text } = await shownIn("web-copy-text-word");
  fireEvent.mouseDown(text, { button: MAIN_BUTTON, ctrlKey: true });
  selected(text);
  fireEvent.contextMenu(text, { button: MAIN_BUTTON, ctrlKey: true });

  await expect(screen.findByRole("menuitem", { name: "Copy text" })).resolves.toBeDefined();

  close();
});

it("the menu key on a message with text selected in it, after a left click, keeps the browser's menu", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, text } = await shownIn("web-copy-text-key");
  fireEvent.mouseDown(text, { button: MAIN_BUTTON });
  selected(text);
  const browserMenu = fireEvent.contextMenu(text);

  expect([browserMenu, screen.queryByRole("menu")]).toStrictEqual([true, null]);

  close();
});
