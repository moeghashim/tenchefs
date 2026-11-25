import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { idOf, postedIn } from "./feed.ts";
import { inPane, inThread } from "./regions.ts";
import type { Message } from "../../sdk/index.ts";
import { openAt } from "./render.tsx";

const TEXTS = ["Before.", "Deploy?", "After."] as const;

interface Shown {
  readonly label: string | null;
  readonly tooltip: string | null;
  readonly named: boolean;
  readonly text: string;
  readonly drawn: string;
}

function drawnOf(control: () => HTMLElement): string {
  if (control().querySelector('svg[aria-hidden="true"]') !== null) {
    return "icon";
  }
  return control().dataset["symbol"] ?? "nothing";
}

function namedAs(bar: () => HTMLElement, name: string): readonly HTMLElement[] {
  return [...within(bar()).queryAllByRole("button", { name }), ...within(bar()).queryAllByRole("link", { name })];
}

function hoverBarOf(article: () => HTMLElement): readonly Shown[] {
  const bar = within(article()).getByRole("group", { name: "Quick actions" });
  const shown: Shown[] = [];
  for (const control of bar.querySelectorAll<HTMLElement>("a, button")) {
    const tooltip = control.getAttribute("title");
    shown.push({
      drawn: drawnOf(() => control),
      label: control.getAttribute("aria-label"),
      named: namedAs(() => bar, tooltip ?? "").includes(control),
      text: control.textContent,
      tooltip,
    });
  }
  return shown;
}

function iconNamed(name: string): Shown {
  return { drawn: "icon", label: name, named: true, text: "", tooltip: name };
}

const THUMBS_UP: Shown = { drawn: "👍", label: "React with 👍", named: true, text: "", tooltip: "React with 👍" };

function valueOf(box: () => HTMLElement): string {
  const shown = box();
  if (!(shown instanceof HTMLTextAreaElement)) {
    throw new TypeError("The reply box is no text area");
  }
  return shown.value;
}

async function articleIn(list: string, text: string): Promise<HTMLElement> {
  const found = await within(await screen.findByRole("feed", { name: list })).findByText(text);
  const article = found.closest("article");
  if (article === null) {
    throw new TypeError(`${text} is in no message`);
  }
  return article;
}

it("a channel message's hover bar holds 👍, Reply, Close thread and More actions, and no Open thread, each an icon labelled as its tooltip", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const posted = await postedIn({ channel: "web-hover-bar", closed: [], texts: TEXTS });
  const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}` });

  const article = await articleIn("Messages", "Deploy?");

  expect(hoverBarOf(() => article)).toStrictEqual([
    THUMBS_UP,
    iconNamed("Reply"),
    iconNamed("Close thread"),
    iconNamed("More actions"),
  ]);

  close();
});

it("a closed thread's hover bar holds Reopen thread as an icon", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const posted = await postedIn({ channel: "web-hover-bar-closed", closed: ["Deploy?"], texts: TEXTS });
  const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}` });
  fireEvent.click(await inPane().findByRole("button", { name: "1 closed thread" }));

  const article = await articleIn("Messages", "Deploy?");

  expect(hoverBarOf(() => article)).toStrictEqual([
    THUMBS_UP,
    iconNamed("Reply"),
    iconNamed("Reopen thread"),
    iconNamed("More actions"),
  ]);

  close();
});

it("in a thread panel, the parent's hover bar and a reply's hold 👍, Reply and More actions", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const posted = await postedIn({ channel: "web-hover-bar-panel", closed: [], texts: TEXTS });
  const parent = idOf({ posted, text: "Deploy?" });
  await posted.poster.createMessage({ channel: posted.channel, replyTo: parent, text: "Noon works." });
  const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}/threads/${String(parent)}` });
  const reply = await articleIn("Replies", "Noon works.");
  const shownParent = await inThread().findByRole("article", { name: "Parent message" });

  expect([hoverBarOf(() => shownParent), hoverBarOf(() => reply)]).toStrictEqual([
    [THUMBS_UP, iconNamed("Reply"), iconNamed("More actions")],
    [THUMBS_UP, iconNamed("Reply"), iconNamed("More actions")],
  ]);

  close();
});

it("pressing a channel message's hover Reply opens its thread with the cursor in the reply box", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const posted = await postedIn({ channel: "web-hover-bar-reply", closed: [], texts: TEXTS });
  const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}` });
  const article = await articleIn("Messages", "Deploy?");
  fireEvent.click(within(article).getByRole("link", { name: "Reply" }));
  const box = await within(await screen.findByRole("complementary", { name: "Thread" })).findByRole("textbox", {
    name: "Reply",
  });

  await waitFor(() => {
    expect([document.activeElement === box, globalThis.location.hash]).toStrictEqual([
      true,
      `#/channels/${posted.channel}/threads/${String(idOf({ posted, text: "Deploy?" }))}`,
    ]);
  });

  close();
});

interface ThreadOpen {
  readonly close: () => void;
  readonly message: Message;
}

async function threadWithReply(channel: string): Promise<ThreadOpen> {
  const posted = await postedIn({ channel, closed: [], texts: TEXTS });
  const parent = idOf({ posted, text: "Deploy?" });
  const { message } = await posted.poster.createMessage({ channel: posted.channel, replyTo: parent, text: "Noon." });
  const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}/threads/${String(parent)}` });
  return { close, message };
}

it("pressing a thread reply's hover Reply puts @its-author in the reply box, keeping the draft", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, message } = await threadWithReply("web-hover-bar-thread-reply");
  const reply = await articleIn("Replies", "Noon.");
  const box = await within(await screen.findByRole("complementary", { name: "Thread" })).findByRole("textbox", {
    name: "Reply",
  });
  fireEvent.change(box, { target: { value: "works" } });
  fireEvent.click(within(reply).getByRole("button", { name: "Reply" }));

  await waitFor(() => {
    expect([document.activeElement === box, valueOf(() => box)]).toStrictEqual([true, `@${message.author.name} works`]);
  });

  close();
});
