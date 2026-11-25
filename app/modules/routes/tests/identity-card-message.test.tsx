import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { openAt } from "./render.tsx";

const PREFIX = "web-card-message";

interface Opened {
  readonly author: string;
  readonly close: () => void;
}

interface Focus {
  readonly card: boolean;
  readonly focused: string | null;
}

interface Box {
  readonly focused: boolean;
  readonly text: string | null;
}

async function cardName(author: string, region: () => HTMLElement): Promise<HTMLElement> {
  const name = await waitFor(() => {
    const link = within(region()).getByRole("link", { name: author });

    expect(link.dataset).toHaveProperty("identityCard");

    return link;
  });
  return name;
}

async function authorName(author: string): Promise<HTMLElement> {
  const name = await cardName(author, () => screen.getByRole("feed", { name: "Messages" }));
  return name;
}

async function openedOn(channel: string): Promise<Opened> {
  const author = `${channel}-author`;
  const poster = await newIdentity({ kind: "human", name: author });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await adminClient().createChannel({ name: channel });
  await poster.client.createMessage({ channel, text: "Hello" });
  const close = openAt({ client: reader.client, hash: `#/channels/${channel}` });
  await authorName(author);
  return { author, close };
}

function focusedText(): string | null {
  const active = globalThis.document.activeElement;
  if (active === null) {
    return null;
  }
  return active.textContent;
}

function focusNow(): Focus {
  return {
    card: screen.queryByRole("dialog") !== null,
    focused: focusedText(),
  };
}

function boxNow(): Box {
  const box = screen.getByRole("textbox", { name: "Message" });
  const focused = box === globalThis.document.activeElement;
  if (box instanceof HTMLTextAreaElement) {
    return { focused, text: box.value };
  }
  return { focused, text: null };
}

function pressOnFocused(key: string, shiftKey = false): void {
  fireEvent.keyDown(globalThis.document.activeElement ?? globalThis.document.body, { key, shiftKey });
}

async function cardInto(author: string): Promise<HTMLElement> {
  const name = await authorName(author);
  name.focus();
  const card = await screen.findByRole("dialog", { name: author });
  pressOnFocused("Tab");
  return card;
}

async function closedFocus(): Promise<Focus> {
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  return focusNow();
}

it("the card's Message puts @name in the channel's message box and focuses it, closing the card", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const opened = await openedOn(`${PREFIX}-mouse`);
  fireEvent.pointerMove(await authorName(opened.author), { pointerType: "mouse" });
  const card = await screen.findByRole("dialog", { name: opened.author });
  fireEvent.click(within(card).getByRole("button", { name: "Message" }));

  await waitFor(() => {
    expect([boxNow(), screen.queryByRole("dialog")]).toStrictEqual([
      { focused: true, text: `@${opened.author} ` },
      null,
    ]);
  });

  opened.close();
});

it("pressing Tab on a focused name moves into its card, and Tab off its last button returns to the name with the card closed", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const opened = await openedOn(`${PREFIX}-tab`);
  const card = await cardInto(opened.author);
  const entered = focusNow();
  within(card).getByRole("link", { name: "View profile" }).focus();
  pressOnFocused("Tab");

  await expect(closedFocus()).resolves.toStrictEqual({ card: false, focused: opened.author });
  expect(entered).toStrictEqual({ card: true, focused: "Message" });

  opened.close();
});

it("pressing Shift-Tab off a card's first button closes it and returns focus to the name", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const opened = await openedOn(`${PREFIX}-shift-tab`);
  await cardInto(opened.author);
  pressOnFocused("Tab", true);

  await expect(closedFocus()).resolves.toStrictEqual({ card: false, focused: opened.author });

  opened.close();
});

it("pressing Escape inside a card closes it and returns focus to the name", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const opened = await openedOn(`${PREFIX}-escape`);
  await cardInto(opened.author);
  pressOnFocused("Escape");

  await expect(closedFocus()).resolves.toStrictEqual({ card: false, focused: opened.author });

  opened.close();
});

interface InThread extends Opened {
  readonly panel: HTMLElement;
}

async function openedInThread(channel: string): Promise<InThread> {
  const author = `${channel}-author`;
  const poster = await newIdentity({ kind: "human", name: author });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await adminClient().createChannel({ name: channel });
  const { message } = await poster.client.createMessage({ channel, text: "Hello" });
  const close = openAt({ client: reader.client, hash: `#/channels/${channel}/threads/${String(message.id)}` });
  const panel = await screen.findByRole("complementary", { name: "Thread" });
  return { author, close, panel };
}

it("in a thread panel, the card's Message puts @name in the thread's reply box", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const { author, close, panel } = await openedInThread(`${PREFIX}-thread`);
  fireEvent.pointerMove(await cardName(author, () => panel), { pointerType: "mouse" });
  fireEvent.click(within(await screen.findByRole("dialog", { name: author })).getByRole("button", { name: "Message" }));

  await waitFor(() => {
    expect(within(panel).getByRole("textbox", { name: "Reply" })).toHaveProperty("value", `@${author} `);
  });

  close();
});
