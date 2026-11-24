import { expect, it, onTestFinished, vi } from "vitest";
import { feedOf, idOf, postedIn } from "./feed.ts";
import { inPane, inSidebar } from "./regions.ts";
import type { Posted } from "./feed.ts";
import { adminClient } from "./identities.ts";
import { fireEvent } from "@testing-library/react";
import { openAt } from "./render.tsx";

const CLOSED = "Closed";
const NONE = 0;

function scrolledIntoView(): () => readonly unknown[] {
  const scroll = vi.fn<() => void>();
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scroll });
  onTestFinished(() => {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });
  return () => scroll.mock.contexts;
}

async function feedShows(texts: readonly string[], shown: readonly string[]): Promise<void> {
  await vi.waitFor(async () => {
    await expect(feedOf(texts)).resolves.toStrictEqual(shown);
  });
}

async function articleSaying(text: Readonly<RegExp>): Promise<Element> {
  const found = await inPane().findByText(text);
  const article = found.closest("article");
  if (article === null) {
    throw new TypeError(`${text.source} is in no message`);
  }
  return article;
}

async function readAll(posted: Posted): Promise<void> {
  await vi.waitFor(async () => {
    const { items } = await posted.reader.inbox();

    expect(items.filter((item) => item.channel.name === posted.channel)).toHaveLength(NONE);
  });
}

interface Opened {
  readonly close: () => void;
  readonly scrolled: () => readonly unknown[];
}

interface Reopening {
  readonly posted: Posted;
  readonly close: () => void;
  readonly read: string;
}

function openChannel(posted: Posted): Opened {
  const scrolled = scrolledIntoView();
  return { close: openAt({ client: posted.reader, hash: `#/channels/${posted.channel}` }), scrolled };
}

async function openedAgain({ close, posted, read }: Reopening): Promise<() => void> {
  close();
  const reading = openAt({ client: posted.reader, hash: read });
  await readAll(posted);
  reading();
  return openAt({ client: posted.reader, hash: `#/channels/${posted.channel}` });
}

async function followedAndClosed(channel: string, texts: readonly string[]): Promise<Posted> {
  const posted = await postedIn({ channel, closed: [], texts });
  const parent = idOf({ posted, text: "Done a." });
  await posted.reader.follow(parent);
  await posted.poster.createMessage({ channel, replyTo: parent, text: "One more thing." });
  await posted.poster.closeThread(parent);
  await posted.poster.closeThread(idOf({ posted, text: "Done b." }));
  return posted;
}

async function closedMentionIn(posted: Posted, channel: string): Promise<void> {
  await adminClient().createChannel({ name: channel });
  const { message } = await posted.poster.createMessage({ channel, text: `@${posted.readerName} over here.` });
  await posted.poster.closeThread(message.id);
}

async function highlightedSaying(text: Readonly<RegExp>): Promise<void> {
  const article = await articleSaying(text);
  await vi.waitFor(() => {
    expect(article.getAttribute("aria-current")).toBe("true");
  });
}

it("a closed thread mentioning you shows outside the fold, labelled Closed, and folds again once read", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const mention = "@web-held-mention-grace done a.";
  const texts = ["Open one.", mention, "Done b.", "Open two."];
  const posted = await postedIn({ channel: "web-held-mention", closed: [mention, "Done b."], texts });
  const { close } = openChannel(posted);
  await feedShows(texts, ["Open one.", mention, "<1 closed thread>", "Open two."]);

  await expect(articleSaying(/done a\./u)).resolves.toHaveProperty("textContent", expect.stringContaining(CLOSED));

  const again = await openedAgain({ close, posted, read: `#/channels/${posted.channel}` });

  await feedShows(texts, ["Open one.", "<2 closed threads>", "Open two."]);

  again();
});

it("a closed thread you follow with an unread reply shows outside the fold until you've read the thread", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const texts = ["Open one.", "Done a.", "Done b."];
  const posted = await followedAndClosed("web-held-followed", texts);
  const { close } = openChannel(posted);

  await feedShows(texts, ["Open one.", "Done a.", "<1 closed thread>"]);

  const thread = `#/channels/${posted.channel}/threads/${String(idOf({ posted, text: "Done a." }))}`;
  const again = await openedAgain({ close, posted, read: thread });

  await feedShows(texts, ["Open one.", "<2 closed threads>"]);

  again();
});

it("opening the channel scrolls to the first unread item for you and highlights it, the closed thread included", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const mention = "@web-held-scroll-grace done a.";
  const texts = ["Open one.", mention, "@web-held-scroll-grace later."];
  const posted = await postedIn({ channel: "web-held-scroll", closed: [mention], texts });
  const { close, scrolled } = openChannel(posted);
  const article = await articleSaying(/done a\./u);

  await vi.waitFor(() => {
    expect(article.getAttribute("aria-current")).toBe("true");
  });

  expect(scrolled()).toStrictEqual([article]);

  close();
});

it("opening a channel with no closed thread unread for you scrolls to nothing", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const mention = "@web-held-none-grace open.";
  const texts = ["Done a.", mention];
  const posted = await postedIn({ channel: "web-held-none", closed: ["Done a."], texts });
  const { close, scrolled } = openChannel(posted);

  await feedShows(texts, ["<1 closed thread>", mention]);

  expect(scrolled()).toStrictEqual([]);

  close();
});

it("moving to another channel holds and highlights that channel's own closed thread", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const mention = "@web-held-switch-grace done a.";
  const posted = await postedIn({ channel: "web-held-switch", closed: [mention], texts: ["Open one.", mention] });
  await closedMentionIn(posted, "web-held-switch-b");
  const { close } = openChannel(posted);
  await highlightedSaying(/done a\./u);
  fireEvent.click(await inSidebar().findByRole("link", { name: /^#web-held-switch-b/u }));

  await expect(highlightedSaying(/over here\./u)).resolves.toBeUndefined();

  close();
});
