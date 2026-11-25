import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { adminClient } from "./identities.ts";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";
import { postedIn } from "./feed.ts";

const TEXTS = ["The oldest.", "The middle.", "The newest."] as const;
const DRAFT = "Half a thought";

function messageSaying(text: string): HTMLElement {
  const feed = screen.getByRole("feed", { name: "Messages" });
  for (const article of within(feed).getAllByRole("article")) {
    if (article.textContent.includes(text)) {
      return article;
    }
  }
  throw new TypeError(`No message says ${text}`);
}

function box(): HTMLTextAreaElement {
  const found = screen.getByRole("textbox", { name: "Message" });
  if (!(found instanceof HTMLTextAreaElement)) {
    throw new TypeError("The message box is no text area");
  }
  return found;
}

function focusedText(): string {
  const focused = globalThis.document.activeElement;
  if (focused === null) {
    return "";
  }
  return focused.textContent;
}

function pressedInBox(key: string): boolean {
  return !fireEvent.keyDown(box(), { key });
}

async function foldShown(): Promise<HTMLElement> {
  const button = await inPane().findByRole("button", { name: "1 closed thread" });
  const fold = button.closest<HTMLElement>("article");
  if (fold === null) {
    throw new TypeError("The fold is no article");
  }
  return fold;
}

async function opened(channel: string): Promise<() => void> {
  const posted = await postedIn({ channel, closed: [], texts: TEXTS });
  const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}` });
  await screen.findByText("The newest.");
  return close;
}

it("↑ in an empty message box focuses the newest message, and with the caret after the first character it moves the cursor", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await opened("web-box-up");
  box().focus();
  const empty = pressedInBox("ArrowUp");
  const newest = await waitFor(focusedText);
  box().focus();
  fireEvent.change(box(), { target: { value: DRAFT } });
  const typed = pressedInBox("ArrowUp");

  expect([empty, newest.endsWith("The newest."), typed, globalThis.document.activeElement === box()]).toStrictEqual([
    true,
    true,
    false,
    true,
  ]);

  close();
});

it("escape in the message box keeps the draft and focuses the message focused before it", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await opened("web-box-escape");
  messageSaying("The middle.").focus();
  box().focus();
  fireEvent.change(box(), { target: { value: DRAFT } });
  const handled = pressedInBox("Escape");

  expect([handled, focusedText().endsWith("The middle."), box().value]).toStrictEqual([true, true, DRAFT]);

  close();
});

it("escape in a message box focused from nowhere focuses the newest message", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await opened("web-box-escape-nowhere");
  box().focus();
  const handled = pressedInBox("Escape");

  expect([handled, focusedText().endsWith("The newest.")]).toStrictEqual([true, true]);

  close();
});

it("↑ and Escape in another text field, such as the People filter, are left to it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/people" });
  const filter = await screen.findByRole("textbox", { name: "Filter by name" });
  filter.focus();
  const up = !fireEvent.keyDown(filter, { key: "ArrowUp" });
  const escape = !fireEvent.keyDown(filter, { key: "Escape" });

  expect([up, escape, globalThis.document.activeElement === filter]).toStrictEqual([false, false, true]);

  close();
});

it("+ on a fold of closed threads, which takes no Reaction, is left alone", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const posted = await postedIn({ channel: "web-box-fold-react", closed: ["The oldest."], texts: TEXTS });
  const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}` });
  const fold = await foldShown();
  fold.focus();

  expect(fireEvent.keyDown(fold, { key: "+" })).toBe(true);

  close();
});

it("↑ in the empty message box of a channel with no messages is left to the box", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-box-up-nothing";
  await adminClient().createChannel({ name: channel });
  const close = openAt({ client: adminClient(), hash: `#/channels/${channel}` });
  await screen.findByRole("textbox", { name: "Message" });
  box().focus();

  expect([pressedInBox("ArrowUp"), globalThis.document.activeElement === box()]).toStrictEqual([false, true]);

  close();
});
