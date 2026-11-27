import { expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { firstRowSelected, focusedHref, pressed } from "./inbox-keys.ts";
import { inConversation, inPane, inThread } from "./regions.ts";
import { adminClient } from "./identities.ts";
import { openAt } from "./render.tsx";
import { postedIn } from "./feed.ts";
import { viewOpened } from "./view-opened.ts";

const TEXTS = ["The parent.", "The newest."] as const;
const DRAFT = "Half a thought";
const LEFT = "ArrowLeft";
const UP = "ArrowUp";
const START = 0;
const THIRD = 3;
const LAST = -1;

function textArea(element: unknown): HTMLTextAreaElement {
  if (!(element instanceof HTMLTextAreaElement)) {
    throw new TypeError("The box is no text area");
  }
  return element;
}

function newestInConversation(): HTMLElement {
  const newest = inConversation().getAllByRole("article").at(LAST);
  if (!(newest instanceof HTMLElement)) {
    throw new TypeError("The conversation has no message");
  }
  return newest;
}

function messageBox(): HTMLTextAreaElement {
  return textArea(inPane().getByRole("textbox", { name: "Message" }));
}

function typedAt(element: unknown, caret: number): void {
  const box = textArea(element);
  box.focus();
  fireEvent.change(box, { target: { value: DRAFT } });
  box.setSelectionRange(caret, caret);
}

function pressedIn(box: unknown, key: string): boolean {
  return !fireEvent.keyDown(textArea(box), { key });
}

function focusedText(): string {
  const focused = globalThis.document.activeElement;
  if (focused === null) {
    return "";
  }
  return focused.textContent;
}

async function threadOpened(channel: string): Promise<() => void> {
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: "The parent." });
  await adminClient().createMessage({ channel, replyTo: message.id, text: "The reply." });
  const { close } = await viewOpened({
    client: adminClient(),
    hash: `#/channels/${channel}/threads/${String(message.id)}`,
    waitingOn: ["listMessages", "getThread"],
  });
  return close;
}

async function channelOpened(channel: string): Promise<() => void> {
  const posted = await postedIn({ channel, closed: [], texts: TEXTS });
  const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}` });
  await screen.findByText("The newest.");
  return close;
}

it("← at a channel box's first character, with text in it, focuses the channel's sidebar link and keeps the text", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-box-left-start";
  const close = await channelOpened(channel);
  typedAt(messageBox(), START);
  const handled = pressedIn(messageBox(), LEFT);

  expect([handled, focusedHref(), messageBox().value]).toStrictEqual([true, `#/channels/${channel}`, DRAFT]);

  close();
});

it("← and ↑ past a channel box's first character, or with text selected, move the caret and keep focus", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await channelOpened("web-box-left-mid");
  typedAt(messageBox(), THIRD);
  const moved = [pressedIn(messageBox(), LEFT), pressedIn(messageBox(), UP)];
  messageBox().setSelectionRange(START, THIRD);
  const selected = [pressedIn(messageBox(), LEFT), pressedIn(messageBox(), UP)];

  expect([moved, selected, globalThis.document.activeElement === messageBox()]).toStrictEqual([
    [false, false],
    [false, false],
    true,
  ]);

  close();
});

it("↑ and ← at a channel box's first character go to the newest message and the sidebar, keeping the text", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-box-up-left";
  const close = await channelOpened(channel);
  typedAt(messageBox(), START);
  const up = pressedIn(messageBox(), UP);
  const newest = await waitFor(focusedText);
  typedAt(messageBox(), START);
  const left = pressedIn(messageBox(), LEFT);

  expect([up, newest.endsWith("The newest."), left, focusedHref(), messageBox().value]).toStrictEqual([
    true,
    true,
    true,
    `#/channels/${channel}`,
    DRAFT,
  ]);

  close();
});

it("← at a thread reply box's first character focuses the thread's channel message", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await threadOpened("web-box-left-reply");
  const reply = textArea(await inThread().findByRole("textbox", { name: "Reply" }));
  typedAt(reply, START);
  const handled = pressedIn(reply, LEFT);

  expect([handled, focusedText().includes("The parent."), reply.value]).toStrictEqual([true, true, DRAFT]);

  close();
});

it("← in the Inbox's empty reply box focuses the conversation's newest message, and ← again its row", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { address, unmount } = await firstRowSelected({ channel: "web-box-left-inbox", section: "Earlier" });
  pressed("r");
  const reply = textArea(inConversation().getByRole("textbox", { name: "Reply" }));
  const handled = pressedIn(reply, LEFT);
  const newest = newestInConversation();
  const onNewest = globalThis.document.activeElement === newest;
  const handledAgain = !fireEvent.keyDown(newest, { key: LEFT });

  expect([handled, onNewest, handledAgain, focusedHref()]).toStrictEqual([true, true, true, address]);

  unmount();
});
