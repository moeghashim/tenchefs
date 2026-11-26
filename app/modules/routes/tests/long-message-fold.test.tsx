import { expect, it, onTestFinished, vi } from "vitest";
import { feedOpened, idOf, postedIn } from "./feed.ts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Posted } from "./feed.ts";

const LONG = "A long report.";
const TALL = 1000;
const SHOWN = 100;
const NONE = 0;
const ONE = 1;

function bodyMeasured(height: number): (this: unknown) => number {
  return function measured(this: unknown): number {
    if (this instanceof HTMLElement && this.classList.contains("message-text")) {
      return height;
    }
    return NONE;
  };
}

function measuredAsLong(): void {
  const scroll = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(bodyMeasured(TALL));
  const client = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(bodyMeasured(SHOWN));
  onTestFinished(() => {
    scroll.mockRestore();
    client.mockRestore();
  });
}

async function readLong(channel: string): Promise<Posted> {
  const posted = await postedIn({ channel, closed: [], texts: [LONG] });
  await posted.reader.ack(idOf({ posted, text: LONG }));
  return posted;
}

async function shownLong(): Promise<HTMLElement> {
  const text = await within(screen.getByRole("main")).findByText(LONG);
  const article = text.closest("article");
  if (!(article instanceof HTMLElement)) {
    throw new TypeError("The long message isn't in an article");
  }
  return article;
}

async function announced(text: string): Promise<void> {
  const region = await screen.findByRole("status", { name: "Announcements" });
  await waitFor(() => {
    expect(region).toHaveProperty("textContent", text);
  });
}

it("a long message you've read folds, and Enter on it unfolds it and says Expanded", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  measuredAsLong();
  const posted = await readLong("web-fold-enter");
  const { close } = await feedOpened({ hash: `#/channels/${posted.channel}`, reader: posted.reader });
  const article = await shownLong();
  const folded = within(article).getAllByRole("button", { name: "Unfold" }).length;
  fireEvent.keyDown(article, { key: "Enter" });

  await announced("Expanded");

  expect([
    folded,
    within(article).queryAllByRole("button", { name: "Unfold" }),
    globalThis.location.hash,
  ]).toStrictEqual([ONE, [], `#/channels/${posted.channel}`]);

  close();
});

it("clicking a folded message's faded end unfolds it and puts focus on the message", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  measuredAsLong();
  const posted = await readLong("web-fold-click");
  const { close } = await feedOpened({ hash: `#/channels/${posted.channel}`, reader: posted.reader });
  const article = await shownLong();
  fireEvent.click(within(article).getByRole("button", { name: "Unfold" }));

  await announced("Expanded");

  expect([within(article).queryAllByRole("button", { name: "Unfold" }), document.activeElement]).toStrictEqual([
    [],
    article,
  ]);

  close();
});

it("a long message you wrote shows unfolded", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  measuredAsLong();
  const posted = await readLong("web-fold-mine");
  const { close } = await feedOpened({ hash: `#/channels/${posted.channel}`, reader: posted.poster });
  const article = await shownLong();

  expect(within(article).queryAllByRole("button", { name: "Unfold" })).toStrictEqual([]);

  close();
});
