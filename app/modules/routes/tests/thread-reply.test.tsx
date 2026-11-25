import { adminClient, newIdentity } from "./identities.ts";
import { chose, pressed } from "./menus.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { CookoutClient } from "../../sdk/index.ts";
import { inThread } from "./regions.ts";
import { openAt } from "./render.tsx";

interface Box {
  readonly text: string;
  readonly caret: number | null;
  readonly focused: boolean;
}

interface Thread {
  readonly reader: CookoutClient;
  readonly hash: string;
}

async function threadOf(channel: string): Promise<Thread> {
  const poster = await newIdentity({ kind: "human", name: `${channel}-ada` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-grace` });
  await adminClient().createChannel({ name: channel });
  const { message: parent } = await poster.client.createMessage({ channel, text: "Deploy?" });
  await poster.client.createMessage({ channel, replyTo: parent.id, text: "Noon works" });
  await reader.client.createMessage({ channel, replyTo: parent.id, text: "Or one" });
  return { hash: `#/channels/${channel}/threads/${String(parent.id)}`, reader: reader.client };
}

async function replyBox(): Promise<HTMLTextAreaElement> {
  const panel = await screen.findByRole("complementary", { name: "Thread" });
  const box = await within(panel).findByLabelText("Reply", { selector: "textarea" });
  if (!(box instanceof HTMLTextAreaElement)) {
    throw new TypeError("No reply box");
  }
  return box;
}

async function typed(text: string): Promise<void> {
  const box = await replyBox();
  fireEvent.change(box, { target: { value: text } });
  box.blur();
}

async function boxShows(expected: Box): Promise<void> {
  const box = await replyBox();
  await waitFor(() => {
    expect({ caret: box.selectionStart, focused: document.activeElement === box, text: box.value }).toStrictEqual(
      expected,
    );
  });
}

function shown(text: string): Box {
  return { caret: text.length, focused: true, text };
}

async function replyNamed(text: string): Promise<HTMLElement> {
  const panel = await screen.findByRole("complementary", { name: "Thread" });
  const replies = await within(panel).findByRole("feed", { name: "Replies" });
  const message = await within(replies).findByText(text);
  const article = message.closest("article");
  if (article === null) {
    throw new TypeError(`No message saying ${text}`);
  }
  return article;
}

async function parentMessage(): Promise<HTMLElement> {
  const parent = await inThread().findByRole("article", { name: "Parent message" });
  return parent;
}

async function repliedFromMenu(message: Promise<HTMLElement>): Promise<void> {
  fireEvent.contextMenu(await message);
  await chose("Reply");
}

it("reply on a reply in a thread puts @its-author at the start of the reply box, keeping the text, with the cursor at the end", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { hash, reader } = await threadOf("web-thread-reply");
  const close = openAt({ client: reader, hash });
  await typed("sounds good");

  await repliedFromMenu(replyNamed("Noon works"));

  await boxShows(shown("@web-thread-reply-ada sounds good"));

  close();
});

it("reply from the thread starter's actions menu mentions its author", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { hash, reader } = await threadOf("web-thread-reply-menu");
  const close = openAt({ client: reader, hash });

  const parent = await parentMessage();
  pressed(() => within(parent).getByRole("button", { name: "More actions" }));
  await chose("Reply");

  await boxShows(shown("@web-thread-reply-menu-ada "));

  close();
});

it("right-clicking a reply and choosing Reply mentions its author", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { hash, reader } = await threadOf("web-thread-reply-right");
  const close = openAt({ client: reader, hash });

  fireEvent.contextMenu(await replyNamed("Noon works"));
  await chose("Reply");

  await boxShows(shown("@web-thread-reply-right-ada "));

  close();
});

it("reply doesn't mention an author the reply box already mentions", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { hash, reader } = await threadOf("web-thread-reply-twice");
  const close = openAt({ client: reader, hash });
  await typed("thanks @web-thread-reply-twice-ada");

  await repliedFromMenu(replyNamed("Noon works"));

  await boxShows(shown("thanks @web-thread-reply-twice-ada"));

  close();
});

it("reply on your own message mentions nobody and puts the cursor in the reply box", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { hash, reader } = await threadOf("web-thread-reply-own");
  const close = openAt({ client: reader, hash });
  await typed("also");

  await repliedFromMenu(replyNamed("Or one"));

  await boxShows(shown("also"));

  close();
});

it("reply on a deactivated author's message mentions nobody and puts the cursor in the reply box", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { hash, reader } = await threadOf("web-thread-reply-off");
  await adminClient().deactivateIdentity("web-thread-reply-off-ada");
  const close = openAt({ client: reader, hash });
  await screen.findAllByText("(deactivated)");

  await repliedFromMenu(parentMessage());

  await boxShows(shown(""));

  close();
});
