import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { adminClient } from "./identities.ts";
import { openAt } from "./render.tsx";

interface Opened {
  readonly channel: string;
  readonly close: () => void;
}

async function opened(channel: string): Promise<Opened> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const { message } = await admin.createMessage({ channel, text: "The parent." });
  await admin.createMessage({ channel, replyTo: message.id, text: "An answer." });
  const close = openAt({ client: admin, hash: `#/channels/${channel}` });
  return { channel, close };
}

async function channelMessage(): Promise<HTMLElement> {
  const feed = await screen.findByRole("feed", { name: "Messages" });
  const text = await within(feed).findByText("The parent.");
  const article = text.closest("article");
  if (article === null) {
    throw new TypeError("The parent is in no message");
  }
  return article;
}

function thread(): HTMLElement {
  return screen.getByRole("complementary", { name: "Thread" });
}

function pressedOn(key: string): boolean {
  const focused = globalThis.document.activeElement ?? globalThis.document.body;
  return !fireEvent.keyDown(focused, { key });
}

async function focusedOn(find: () => HTMLElement): Promise<boolean> {
  await waitFor(() => {
    expect(document.activeElement).toBe(find());
  });
  return true;
}

function replyBox(): HTMLElement {
  return within(thread()).getByRole("textbox", { name: "Reply" });
}

function threadParent(): HTMLElement {
  return within(thread()).getByRole("article", { name: "Parent message" });
}

async function pressedThenOn(key: string, find: () => HTMLElement): Promise<readonly boolean[]> {
  const pressed = pressedOn(key);
  const reached = await focusedOn(find);
  return [pressed, reached];
}

async function leftWithNoChannelMessage(): Promise<boolean> {
  const feed = await screen.findByRole("feed", { name: "Messages" });
  for (const article of within(feed).getAllByRole("article")) {
    article.setAttribute("aria-current", "false");
  }
  threadParent().focus();
  return pressedOn("ArrowLeft");
}

function pressedOffThePanel(message: () => HTMLElement): readonly boolean[] {
  within(message()).getByRole("link", { name: "Reply" }).focus();
  const onLink = pressedOn("r");
  message().focus();
  const toSidebar =
    pressedOn("ArrowLeft") &&
    screen.getByRole("navigation", { name: "Sidebar" }).contains(globalThis.document.activeElement);
  message().focus();
  return [onLink, toSidebar];
}

it("r on a focused message opens its thread with the cursor in the reply box, and again with it open", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close } = await opened("web-message-keys-reply");
  const message = await channelMessage();
  message.focus();
  const first = await pressedThenOn("r", replyBox);
  message.focus();

  expect([...first, ...(await pressedThenOn("r", replyBox))]).toStrictEqual([true, true, true, true]);

  close();
});

it("t opens the thread on its top-level message, ← goes back to the channel message, and t again refocuses it", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close } = await opened("web-message-keys-open");
  const message = await channelMessage();
  message.focus();
  const opening = await pressedThenOn("t", threadParent);
  const back = await pressedThenOn("ArrowLeft", () => message);
  const again = await pressedThenOn("t", threadParent);

  expect([...opening, ...back, ...again]).toStrictEqual([true, true, true, true, true, true]);

  close();
});

it("the message keys leave a key alone off a message and with no control to press, and ← off the thread panel goes to the sidebar", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close } = await opened("web-message-keys-alone");
  const message = await channelMessage();
  const [onLink, toSidebar] = pressedOffThePanel(() => message);
  await pressedThenOn("t", threadParent);
  const openOnParent = pressedOn("t");

  expect([onLink, toSidebar, openOnParent, await leftWithNoChannelMessage()]).toStrictEqual([
    false,
    true,
    false,
    false,
  ]);

  close();
});
