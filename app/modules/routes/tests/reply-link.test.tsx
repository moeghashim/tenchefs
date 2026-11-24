import { expect, it, onTestFinished, vi } from "vitest";
import { idOf, postedIn } from "./feed.ts";
import { inPane, inThread } from "./regions.ts";
import type { MessageId } from "../../sdk/index.ts";
import type { Posted } from "./feed.ts";
import { fireEvent } from "@testing-library/react";
import { openAt } from "./render.tsx";

const NOT_FOUND = "That message wasn't found in this thread.";
const FADE_MS = 4000;
const AFTER_FADE_MS = 2500;

interface Linked {
  readonly posted: Posted;
  readonly reply: MessageId;
}

function scrolledIntoView(): () => readonly unknown[] {
  const scroll = vi.fn<() => void>();
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scroll });
  onTestFinished(() => {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });
  return () => scroll.mock.contexts;
}

async function threadWithReplies(channel: string, closed: readonly string[]): Promise<Linked> {
  const posted = await postedIn({ channel, closed: [], texts: ["Deploy?", "Elsewhere."] });
  const parent = idOf({ posted, text: "Deploy?" });
  const { message } = await posted.poster.createMessage({ channel, replyTo: parent, text: "Noon works." });
  await posted.poster.createMessage({ channel, replyTo: parent, text: "Or one." });
  await Promise.all(
    closed.map(async (text) => {
      await posted.poster.closeThread(idOf({ posted, text }));
    }),
  );
  return { posted, reply: message.id };
}

function linkTo(posted: Posted, message: number): string {
  return `#/channels/${posted.channel}/threads/${String(idOf({ posted, text: "Deploy?" }))}/messages/${String(message)}`;
}

async function articleSaying(text: string): Promise<Element> {
  const found = await inThread().findByText(text);
  const article = found.closest("article");
  if (article === null) {
    throw new TypeError(`${text} is in no message`);
  }
  return article;
}

function highlighted(): readonly Element[] {
  return [...inThread().element().querySelectorAll('article[aria-current="true"]')];
}

async function fadedFrom(text: string): Promise<void> {
  const article = await articleSaying(text);
  await vi.waitFor(
    () => {
      expect(article.getAttribute("aria-current")).toBe("false");
    },
    { timeout: FADE_MS },
  );

  await expect(
    vi.waitFor(
      () => {
        expect(highlighted()).not.toStrictEqual([]);
      },
      { timeout: AFTER_FADE_MS },
    ),
  ).rejects.toThrow("expected [] to not strictly equal []");
}

it("a link to one reply opens its thread with that reply in view and highlighted, which fades for good", {
  timeout: 15_000,
}, async () => {
  expect.hasAssertions();

  const scrolled = scrolledIntoView();
  const { posted, reply } = await threadWithReplies("web-reply-link", []);
  const close = openAt({ client: posted.reader, hash: linkTo(posted, reply) });
  const article = await articleSaying("Noon works.");

  await vi.waitFor(() => {
    expect(highlighted()).toStrictEqual([article]);
  });

  expect(scrolled()).toStrictEqual([article]);
  expect(inThread().element().textContent).not.toContain(NOT_FOUND);

  await fadedFrom("Noon works.");

  close();
});

it("a top-level message's own link highlights the thread's top-level message", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const scrolled = scrolledIntoView();
  const { posted } = await threadWithReplies("web-reply-link-parent", []);
  const close = openAt({ client: posted.reader, hash: linkTo(posted, idOf({ posted, text: "Deploy?" })) });
  const article = await articleSaying("Deploy?");

  await vi.waitFor(() => {
    expect(highlighted()).toStrictEqual([article]);
  });

  expect(scrolled()).toStrictEqual([article]);

  close();
});

it("a link to a message that isn't in the thread opens the thread with no highlight and says so", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const scrolled = scrolledIntoView();
  const { posted } = await threadWithReplies("web-reply-link-unknown", []);
  const close = openAt({ client: posted.reader, hash: linkTo(posted, idOf({ posted, text: "Elsewhere." })) });

  await expect(inThread().findByText(NOT_FOUND)).resolves.toBeDefined();

  expect([highlighted(), scrolled()]).toStrictEqual([[], []]);
  expect(inThread().getByText("Noon works.").textContent).toBe("Noon works.");

  close();
});

it("a link to a reply in a closed thread opens it and highlights the reply", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  scrolledIntoView();
  const { posted, reply } = await threadWithReplies("web-reply-link-closed", ["Deploy?"]);
  const close = openAt({ client: posted.reader, hash: linkTo(posted, reply) });
  const article = await articleSaying("Noon works.");

  await expect(inThread().findByRole("button", { name: "Reopen thread" })).resolves.toBeDefined();

  await vi.waitFor(() => {
    expect(highlighted()).toStrictEqual([article]);
  });

  close();
});

interface BoardLink extends Linked {
  readonly url: string;
}

async function boardLinkIn(channel: string): Promise<BoardLink> {
  const { posted, reply } = await threadWithReplies(channel, []);
  const url = `${globalThis.location.origin}${globalThis.location.pathname}${linkTo(posted, reply)}`;
  await posted.poster.createMessage({ channel, text: `See ${url}` });
  return { posted, reply, url };
}

it("a link in a message to this board opens in place, opening the thread with the reply highlighted", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  scrolledIntoView();
  const { posted, reply, url } = await boardLinkIn("web-reply-link-in-place");
  const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}` });
  const link = await inPane().findByRole("link", { name: url });

  expect(link.getAttribute("target")).toBe("_self");

  fireEvent.click(link);
  const article = await articleSaying("Noon works.");

  await vi.waitFor(() => {
    expect([highlighted(), globalThis.location.hash]).toStrictEqual([[article], linkTo(posted, reply)]);
  });

  close();
});
