import type { CookoutClient, MessageId } from "../../sdk/index.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inPane, inThread } from "./regions.ts";
import { adminClient } from "./identities.ts";
import { openAt } from "./render.tsx";
import { unreachableClient } from "../../testing/index.ts";

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

function hiddenKeysIn(find: () => HTMLElement): readonly (string | null)[] {
  const keys: (string | null)[] = [];
  for (const control of find().querySelectorAll("[hidden][aria-keyshortcuts]")) {
    keys.push(control.getAttribute("aria-keyshortcuts"));
  }
  return keys;
}

it("no message holds a hidden control for its keys, in the channel or the thread panel", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close } = await opened("web-message-keys-no-hidden");
  const message = await channelMessage();
  message.focus();
  await pressedThenOn("t", threadParent);
  await within(thread()).findByText("An answer.");

  expect([hiddenKeysIn(() => message), hiddenKeysIn(thread)]).toStrictEqual([[], []]);

  close();
});

function shownChannelMessage(): HTMLElement {
  const feed = screen.getByRole("feed", { name: "Messages" });
  const article = within(feed).queryByText("The parent.");
  if (article === null) {
    throw new TypeError("The parent isn't shown in the channel");
  }
  return article.closest("article") ?? article;
}

interface OldThread {
  readonly close: () => void;
  readonly parent: MessageId;
}

async function oldThreadOpened(channel: string): Promise<OldThread> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const { message } = await admin.createMessage({ channel, text: "The parent." });
  await admin.createMessage({ channel, replyTo: message.id, text: "An answer." });
  await Promise.all(
    ["One.", "Two.", "Three.", "Four.", "Five."].map(async (text) => {
      await admin.createMessage({ channel, text });
    }),
  );
  const close = openAt({ client: admin, hash: `#/channels/${channel}/threads/${String(message.id)}`, pageSize: 2 });
  await screen.findByText("An answer.");
  return { close, parent: message.id };
}

it("← in a thread whose message isn't loaded in the channel loads older messages until it is, and goes to it", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close } = await oldThreadOpened("web-message-keys-old-thread");
  threadParent().focus();
  const pressed = pressedOn("ArrowLeft");

  expect([pressed, await focusedOn(shownChannelMessage)]).toStrictEqual([true, true]);

  close();
});

it("← in a thread whose message was deleted elsewhere loads every older message, then leaves focus on the thread", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, parent } = await oldThreadOpened("web-message-keys-deleted-thread");
  await adminClient().deleteMessage(parent);
  threadParent().focus();
  const pressed = pressedOn("ArrowLeft");
  await screen.findByText("One.");
  await waitFor(() => {
    expect(inPane().queryByRole("button", { name: "Load older messages" })).toBeNull();
  });

  expect([pressed, document.activeElement === threadParent()]).toStrictEqual([true, true]);

  close();
});

it("← in a thread shown alone, with no channel beside it, leaves the key alone", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const admin = adminClient();
  const channel = "web-message-keys-alone-thread";
  await admin.createChannel({ name: channel });
  const { message } = await admin.createMessage({ channel, text: "The parent." });
  const close = openAt({ client: admin, hash: `#/channels/${channel}/threads/${String(message.id)}/alone` });
  await inThread().findByText("The parent.");
  threadParent().focus();

  expect([pressedOn("ArrowLeft"), document.activeElement === threadParent()]).toStrictEqual([false, true]);

  close();
});

function threadUnreachable(client: CookoutClient, id: MessageId): CookoutClient {
  const unreachable = new Map([[id, unreachableClient({ token: "cookout_unused" })]]);
  return {
    ...client,
    getThread: async (asked) => {
      const answer = await (unreachable.get(asked) ?? client).getThread(asked);
      return answer;
    },
  };
}

async function failedThreadOpened(channel: string): Promise<() => void> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const { message } = await admin.createMessage({ channel, text: "The parent." });
  await admin.createMessage({ channel, replyTo: message.id, text: "An answer." });
  const hash = `#/channels/${channel}/threads/${String(message.id)}/messages/${String(message.id)}`;
  const close = openAt({ client: threadUnreachable(admin, message.id), hash });
  await inThread().findByRole("alert");
  return close;
}

it("t on the open thread's message leaves the key alone while the thread shows no message to go to", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await failedThreadOpened("web-message-keys-thread-failed");
  const shown = await channelMessage();
  shown.focus();

  expect([pressedOn("t"), document.activeElement === shown]).toStrictEqual([false, true]);

  close();
});
