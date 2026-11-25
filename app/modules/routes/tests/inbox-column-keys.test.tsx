import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { CookoutClient } from "../../sdk/index.ts";
import { openAt } from "./render.tsx";

const LEFT = "ArrowLeft";
const RIGHT = "ArrowRight";

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

async function channelLinkShown(channel: string): Promise<void> {
  const sidebar = await screen.findByRole("navigation", { name: "Sidebar" });
  await waitFor(() => {
    expect(sidebar.querySelector(`a[href="#/channels/${channel}"]`)).not.toBeNull();
  });
}

async function readerOfThread(channel: string): Promise<CookoutClient> {
  await adminClient().createChannel({ name: channel });
  const { message: parent } = await adminClient().createMessage({ channel, text: "The thread." });
  const { client } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await client.follow(parent.id);
  await adminClient().createMessage({ channel, replyTo: parent.id, text: "The new reply." });
  return client;
}

function activeHref(): string | null {
  const focused = active();
  if (focused === null) {
    return null;
  }
  return focused.getAttribute("href");
}

function inboxLink(): HTMLElement | null {
  return globalThis.document.querySelector<HTMLElement>('nav[aria-label="Sidebar"] a[href="#/inbox"]');
}

async function inboxRow(): Promise<HTMLElement> {
  const found = await waitFor(() => {
    const row = globalThis.document.querySelector<HTMLElement>("main a[data-feed-row]");
    if (row === null) {
      throw new TypeError("No Inbox row");
    }
    return row;
  });
  return found;
}

it("← on an Inbox row focuses the Inbox's link, and → on it focuses the row again", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const client = await readerOfThread("web-columns-inbox");
  const close = openAt({ client, hash: "#/inbox" });
  const row = await inboxRow();
  const left = pressedOn(row, LEFT);
  const link = activeHref();
  const right = pressedOn(inboxLink(), RIGHT);

  expect([left, link, right, active() === row]).toStrictEqual([true, "#/inbox", true, true]);

  close();
});

it("→ on the Inbox's link from a channel opens the Inbox and lands on its newest row", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const client = await readerOfThread("web-columns-to-inbox");
  const close = openAt({ client, hash: "#/channels/web-columns-to-inbox" });
  await channelLinkShown("web-columns-to-inbox");
  const moved = pressedOn(inboxLink(), RIGHT);
  const row = await inboxRow();
  await waitFor(() => {
    expect(active()).toBe(row);
  });

  expect([moved, globalThis.location.hash]).toStrictEqual([true, "#/inbox"]);

  close();
});
