import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";
import { postedIn } from "./feed.ts";

const TWO_A_PAGE = 2;

function articleSaying(text: string): HTMLElement {
  const feed = screen.getByRole("feed", { name: "Messages" });
  for (const article of within(feed).getAllByRole("article")) {
    if (article.textContent.includes(text)) {
      return article;
    }
  }
  throw new TypeError(`No message says ${text}`);
}

function focusedText(): string {
  const focused = globalThis.document.activeElement;
  if (focused === null) {
    return "";
  }
  return focused.textContent;
}

function pressedOn(key: string): boolean {
  const focused = globalThis.document.activeElement ?? globalThis.document.body;
  return !fireEvent.keyDown(focused, { key });
}

async function focusedAfter(key: string): Promise<string> {
  pressedOn(key);
  const text = await waitFor(focusedText);
  return text;
}

async function openedOn(newest: string): Promise<() => void> {
  const texts = ["Note A.", "Note B.", "Note C.", newest];
  const { channel, reader } = await postedIn({ channel: "web-list-keys", closed: [], texts });
  const close = openAt({ client: reader, hash: `#/channels/${channel}`, pageSize: TWO_A_PAGE });
  await screen.findByText(newest);
  articleSaying(newest).focus();
  return close;
}

async function pastTheOldest(): Promise<readonly (boolean | string)[]> {
  const pressed = pressedOn("ArrowUp");
  await within(screen.getByRole("feed", { name: "Messages" })).findByText("Note A.");
  return [pressed, focusedText().endsWith("Note C.")];
}

it("in a message list, the arrow keys, Home and End move focus, and up past the oldest loads older messages", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await openedOn("Note D.");
  const up = await focusedAfter("ArrowUp");
  const loaded = await pastTheOldest();
  const home = await focusedAfter("Home");
  const end = await focusedAfter("End");

  expect([up, ...loaded, home, end, pressedOn("ArrowDown")]).toStrictEqual([
    expect.stringMatching(/Note C\.$/u),
    true,
    true,
    expect.stringMatching(/Note A\.$/u),
    expect.stringMatching(/Note D\.$/u),
    true,
  ]);

  close();
});

async function unfoldedByEnter(): Promise<string> {
  pressedOn("Enter");
  await inPane().findByText("Done a.");
  const unfolded = await waitFor(() => {
    expect(focusedText()).toContain("Done a.");

    return focusedText();
  });
  return unfolded;
}

async function focusOn(text: string): Promise<void> {
  await inPane().findByText(text);
  articleSaying(text).focus();
}

function leftTheList(): void {
  const box = screen.getByLabelText("Message");
  box.focus();
  box.blur();
}

it("enter on a fold of closed threads unfolds it and focuses what was folded, and the keys leave other places alone", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { channel, reader } = await postedIn({
    channel: "web-list-keys-fold",
    closed: ["Done a."],
    texts: ["Done a.", "Open one."],
  });
  const close = openAt({ client: reader, hash: `#/channels/${channel}` });
  await focusOn("Open one.");
  const fold = await focusedAfter("ArrowUp");
  const unfolded = await unfoldedByEnter();
  leftTheList();

  expect([fold, unfolded, pressedOn("Home")]).toStrictEqual([
    "Today1 closed thread",
    expect.stringContaining("Done a."),
    false,
  ]);

  close();
});
