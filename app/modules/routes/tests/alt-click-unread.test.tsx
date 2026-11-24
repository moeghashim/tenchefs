import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { altClicked, boardOpen, countsOn, newAbove } from "./alt-click.ts";
import { expect, it } from "vitest";

function inFeed(text: string): () => HTMLElement {
  return () => within(screen.getByRole("list", { name: "Messages" })).getByText(text);
}

function inReplies(text: string): () => HTMLElement {
  return () => within(screen.getByRole("list", { name: "Replies" })).getByText(text);
}

function threadLink(): HTMLElement {
  return within(screen.getByRole("list", { name: "Messages" })).getByRole("link", { name: /2 replies/u });
}

async function threadMarkedByAltClick(): Promise<void> {
  altClicked(inReplies("Or one"));
  await waitFor(() => {
    expect(newAbove("Replies")).toContain("Or one");
  });
}

it("alt-clicking a message in the channel feed marks it and everything after it unread", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { channel, close, unreadTexts } = await boardOpen("web-alt-click-feed");
  const { pressKeptItsDefault } = altClicked(inFeed("Second"));
  await waitFor(() => {
    expect([newAbove("Messages"), countsOn(channel), pressKeptItsDefault]).toStrictEqual([
      expect.stringContaining("Second"),
      ["2 unread"],
      false,
    ]);
  });

  await expect(unreadTexts()).resolves.toStrictEqual(["Second", "Third"]);

  await close();
});

it("alt-clicking a reply in the thread panel marks it and everything after it unread", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { channel, close, unreadTexts } = await boardOpen("web-alt-click-thread");
  altClicked(inReplies("Noon works"));
  await waitFor(() => {
    expect([newAbove("Replies"), countsOn(channel)]).toStrictEqual([
      expect.stringContaining("Noon works"),
      ["2 for you"],
    ]);
  });

  await expect(unreadTexts()).resolves.toStrictEqual(["Noon works", "Or one"]);

  await close();
});

it("alt-clicking a link inside a message follows the link and marks nothing unread", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, unreadTexts } = await boardOpen("web-alt-click-link");
  const before = newAbove("Messages");
  const { pressKeptItsDefault } = altClicked(threadLink);
  await threadMarkedByAltClick();

  expect([before, newAbove("Messages"), pressKeptItsDefault]).toStrictEqual([
    expect.stringContaining("First"),
    before,
    true,
  ]);
  await expect(unreadTexts()).resolves.toStrictEqual(["Or one"]);

  await close();
});

it("a plain click on a message marks nothing unread", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close, unreadTexts } = await boardOpen("web-alt-click-plain");
  const before = newAbove("Messages");
  fireEvent.click(inFeed("Third")());
  await threadMarkedByAltClick();

  expect([before, newAbove("Messages")]).toStrictEqual([expect.stringContaining("First"), before]);
  await expect(unreadTexts()).resolves.toStrictEqual(["Or one"]);

  await close();
});

it("the Mark unread menu item's tooltip names Alt-click", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close } = await boardOpen("web-alt-click-tooltip");
  fireEvent.contextMenu(inFeed("Third")());
  const item = await screen.findByRole("menuitem", { name: "Mark unread" });
  act(() => {
    item.focus();
  });
  const tooltip = await screen.findByRole("tooltip");

  expect(tooltip.textContent).toBe("Mark unread (Alt-click)");

  await close();
});
