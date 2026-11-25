import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { adminClient } from "./identities.ts";
import { inThread } from "./regions.ts";
import { openAt } from "./render.tsx";

const LEFT = "ArrowLeft";
const RIGHT = "ArrowRight";
const DOWN = "ArrowDown";
const UP = "ArrowUp";

async function seeded(channel: string): Promise<number> {
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: "The oldest." });
  await adminClient().createMessage({ channel, text: "The newest." });
  await adminClient().createMessage({ channel, replyTo: message.id, text: "The reply." });
  return message.id;
}

async function openedAt(hash: string): Promise<() => void> {
  const close = openAt({ client: adminClient(), hash });
  await screen.findByRole("feed", { name: "Messages" });
  return close;
}

async function threadOpened(channel: string): Promise<() => void> {
  const parent = await seeded(channel);
  const close = await openedAt(`#/channels/${channel}/threads/${String(parent)}`);
  await inThread().findByText("The reply.");
  return close;
}

function articleAround(found: unknown): HTMLElement {
  if (!(found instanceof HTMLElement)) {
    throw new TypeError("Nothing found");
  }
  const article = found.closest("article");
  if (!(article instanceof HTMLElement)) {
    throw new TypeError("Not in a message");
  }
  return article;
}

async function messageSaying(text: string): Promise<HTMLElement> {
  const feed = await screen.findByRole("feed", { name: "Messages" });
  const found = await within(feed).findByText(text);
  return articleAround(found);
}

function reply(): HTMLElement {
  return articleAround(inThread().getByText("The reply."));
}

async function linkTo(channel: string): Promise<HTMLElement> {
  const sidebar = await screen.findByRole("navigation", { name: "Sidebar" });
  return waitFor(() => {
    const link = sidebar.querySelector<HTMLElement>(`a[href="#/channels/${channel}"]`);
    if (link === null) {
      throw new TypeError(`No sidebar link to #${channel}`);
    }
    return link;
  });
}

function pressedOn(element: unknown, key: string): boolean {
  if (!(element instanceof HTMLElement)) {
    throw new TypeError("Nothing to press on");
  }
  element.focus();
  return !fireEvent.keyDown(element, { key });
}

function active(): Element | null {
  return globalThis.document.activeElement;
}

function unfeed(): void {
  for (const feed of globalThis.document.querySelectorAll('main [role="feed"]')) {
    feed.removeAttribute("role");
  }
}

function unselect(): void {
  for (const each of globalThis.document.querySelectorAll('article[aria-current="true"]')) {
    each.setAttribute("aria-current", "false");
  }
}

function unboxed(): void {
  for (const box of globalThis.document.querySelectorAll('main textarea[name="text"]')) {
    box.removeAttribute("name");
  }
}

function pressedRightOnOthers(): readonly boolean[] {
  const pressed: boolean[] = [];
  for (const link of globalThis.document.querySelectorAll(
    'nav[aria-label="Sidebar"] a[href]:not([href^="#/channels/"]):not([href="#/inbox"])',
  )) {
    pressed.push(pressedOn(link, RIGHT));
  }
  return pressed;
}

it("← on a channel message focuses the sidebar on that channel's link", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const close = await threadOpened("web-columns-left");
  const fromChannel = pressedOn(await messageSaying("The newest."), LEFT);

  expect([fromChannel, active()]).toStrictEqual([true, await linkTo("web-columns-left")]);

  close();
});

it("→ on the open channel's link focuses the selected message, or else the newest", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const close = await threadOpened("web-columns-right");
  const link = await linkTo("web-columns-right");
  pressedOn(link, RIGHT);
  const selected = active();
  unselect();
  pressedOn(link, RIGHT);

  expect([selected, active()]).toStrictEqual([await messageSaying("The oldest."), await messageSaying("The newest.")]);

  close();
});

it("→ on the open channel's link moves nothing with no messages shown", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  await seeded("web-columns-right-none");
  const close = await openedAt("#/channels/web-columns-right-none");
  const link = await linkTo("web-columns-right-none");
  unfeed();

  expect([pressedOn(link, RIGHT), active()]).toStrictEqual([false, link]);

  close();
});

it("→ on another channel's link opens it and lands on its newest message", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  await seeded("web-columns-other");
  await seeded("web-columns-start");
  const close = await openedAt("#/channels/web-columns-start");
  const moved = pressedOn(await linkTo("web-columns-other"), RIGHT);
  await waitFor(async () => {
    expect(active()).toBe(await messageSaying("The newest."));
  });

  expect([moved, globalThis.location.hash]).toStrictEqual([true, "#/channels/web-columns-other"]);

  close();
});

it("→ leaves a key alone on a sidebar link that isn't a channel's or the Inbox's, or a row's button", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  await seeded("web-columns-not-link");
  const close = await openedAt("#/channels/web-columns-not-link");
  await linkTo("web-columns-not-link");
  const button = globalThis.document.querySelector('nav[aria-label="Sidebar"] li button');

  expect([pressedRightOnOthers().includes(true), pressedOn(button, RIGHT)]).toStrictEqual([false, false]);

  close();
});

it("↓ on a column's newest message focuses its message box", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const close = await threadOpened("web-columns-down");
  pressedOn(await messageSaying("The newest."), DOWN);
  const channelBox = active();
  pressedOn(reply(), DOWN);

  expect([channelBox, active()]).toStrictEqual([
    screen.getByRole("textbox", { name: "Message" }),
    inThread().getByRole("textbox", { name: "Reply" }),
  ]);

  close();
});

it("↓ on the newest message stays put with no message box", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  await seeded("web-columns-no-box");
  const close = await openedAt("#/channels/web-columns-no-box");
  const newest = await messageSaying("The newest.");
  unboxed();
  pressedOn(newest, DOWN);

  expect(active()).toBe(newest);

  close();
});

it("↓ on the newest message stays put with no channel feed", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  await seeded("web-columns-no-feed");
  const close = await openedAt("#/channels/web-columns-no-feed");
  const newest = await messageSaying("The newest.");
  unfeed();
  pressedOn(newest, DOWN);

  expect(active()).toBe(newest);

  close();
});

function topMessage(): HTMLElement {
  return inThread().getByRole("article", { name: "Parent message" });
}

it("↑ on the thread's first reply focuses its top message, and ↓ there goes back to the reply", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const close = await threadOpened("web-columns-top");
  const up = pressedOn(reply(), UP);
  const top = active();
  const down = pressedOn(topMessage(), DOWN);

  expect([up, top, down, active()]).toStrictEqual([true, topMessage(), true, reply()]);

  close();
});

it("↑ and ↓ leave the top message alone off a message, and off the thread panel", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const close = await threadOpened("web-columns-top-off");
  const fromLink = pressedOn(inThread().getByRole("link", { name: "Close panel" }), UP);
  pressedOn(await messageSaying("The oldest."), DOWN);

  expect([fromLink, active()]).toStrictEqual([false, await messageSaying("The newest.")]);

  close();
});
