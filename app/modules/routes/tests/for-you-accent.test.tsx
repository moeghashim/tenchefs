import type { CookoutClient, Message } from "../../sdk/index.ts";
import { expect, it } from "vitest";
import { people, post } from "./attention-posts.ts";
import { screen, within } from "@testing-library/react";
import type { People } from "./attention-posts.ts";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";

const DOT = '[aria-hidden="true"].rounded-full.bg-mention-bar';
const PLAIN = "for you: false, dot: false, filled: false";
const FILLED = "for you: true, dot: false, filled: true";

function accentsOf(found: () => readonly Element[]): readonly string[] {
  const accents: string[] = [];
  for (const element of found()) {
    const dotted = element.querySelector(DOT) !== null;
    const filled = /\bbg-mention-(?:bar|bg)\b/u.test(element.className);
    const forYou = element.matches('[data-for-you="true"]');
    accents.push(`for you: ${String(forYou)}, dot: ${String(dotted)}, filled: ${String(filled)}`);
  }
  return accents;
}

it("a For you row in the Inbox has an accent dot, not a filled block", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-attention-row";
  const { poster, reader } = await people(channel);
  await post({ by: poster, channel, text: `@${channel}-reader one for you` });
  const close = openAt({ client: reader, hash: "#/inbox" });
  const list = await screen.findByRole("list", { name: "For you" });

  expect(accentsOf(() => within(list).getAllByRole("listitem"))).toStrictEqual([
    "for you: false, dot: true, filled: false",
  ]);

  close();
});

function repliesShown(): readonly string[] {
  const panel = screen.getByRole("complementary", { name: "Thread" });
  return accentsOf(() => within(within(panel).getByRole("feed", { name: "Replies" })).getAllByRole("article"));
}

interface Threads {
  readonly reader: CookoutClient;
  readonly theirs: Message;
  readonly mine: Message;
}

async function mixedThreads(channel: string): Promise<Threads> {
  const { poster, reader } = await people(channel);
  const theirs = await post({ by: poster, channel, text: "Deploy at noon?" });
  await post({ by: poster, channel, replyTo: theirs, text: "Noon works" });
  await post({ by: poster, channel, replyTo: theirs, text: `@${channel}-reader does noon suit you?` });
  const mine = await post({ by: reader, channel, text: "Rollback plan?" });
  await post({ by: poster, channel, replyTo: mine, text: "It's in the doc" });
  return { mine, reader, theirs };
}

it("in a thread, a reply that mentions you or answers your message has the filled accent block, and other replies look normal", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-attention-thread";
  const { mine, reader, theirs } = await mixedThreads(channel);
  const close = openAt({ client: reader, hash: `#/channels/${channel}/threads/${String(theirs.id)}` });
  await screen.findByText("Noon works");
  const inTheirs = repliesShown();
  globalThis.location.hash = `#/channels/${channel}/threads/${String(mine.id)}`;
  await screen.findByText("It's in the doc");

  expect([inTheirs, repliesShown()]).toStrictEqual([[PLAIN, FILLED], [FILLED]]);

  close();
});

it("a thread's parent message that mentions you has the filled accent block", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-attention-parent";
  const { poster, reader } = await people(channel);
  const parent = await post({ by: poster, channel, text: `@${channel}-reader a thread for you` });
  await post({ by: poster, channel, replyTo: parent, text: "First reply" });
  const close = openAt({ client: reader, hash: `#/channels/${channel}/threads/${String(parent.id)}` });
  await screen.findByText("First reply");
  const panel = screen.getByRole("complementary", { name: "Thread" });

  expect(accentsOf(() => [within(panel).getByRole("article", { name: "Parent message" })])).toStrictEqual([FILLED]);

  close();
});

it("in a channel, a message that mentions you has the filled accent block, and other messages look normal", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-attention-feed";
  const { poster, reader } = await people(channel);
  await post({ by: poster, channel, text: "Lunch first" });
  await post({ by: poster, channel, text: `Hello @${channel}-reader` });
  const close = openAt({ client: reader, hash: `#/channels/${channel}` });
  await inPane().findByText("Lunch first");

  expect(
    accentsOf(() => within(inPane().getByRole("feed", { name: "Messages" })).getAllByRole("article")),
  ).toStrictEqual([PLAIN, FILLED]);

  close();
});

interface Following extends People {
  readonly channel: string;
  readonly text: string;
}

async function followed({ channel, poster, reader, text }: Following): Promise<Message> {
  const parent = await post({ by: poster, channel, text });
  await reader.follow(parent.id);
  return parent;
}

interface Threaded {
  readonly by: CookoutClient;
  readonly channel: string;
  readonly mixed: Message;
  readonly loud: Message;
}

async function repliedForYou({ by, channel, loud, mixed }: Threaded): Promise<void> {
  await post({ by, channel, replyTo: mixed, text: "Not me" });
  await post({ by, channel, replyTo: mixed, text: "Nor me" });
  await post({ by, channel, replyTo: mixed, text: `@${channel}-reader could you?` });
  await post({ by, channel, replyTo: loud, text: `@${channel}-reader it's in the doc` });
}

async function followedThreads(channel: string): Promise<CookoutClient> {
  const { poster, reader } = await people(channel);
  const quiet = await followed({ channel, poster, reader, text: "Deploy at noon?" });
  const mixed = await followed({ channel, poster, reader, text: "Who reviews?" });
  const loud = await followed({ channel, poster, reader, text: "Rollback plan?" });
  await post({ by: poster, channel, replyTo: quiet, text: "Noon works" });
  await post({ by: poster, channel, replyTo: quiet, text: "Or one" });
  await repliedForYou({ by: poster, channel, loud, mixed });
  return reader;
}

function lookOf(summary: string, news: string): string {
  const link = inPane().getByRole("link", { name: new RegExp(`^${summary}`, "u") });
  const text = within(link).getByText(news);
  const dot = text.matches(`${DOT} + *`);
  return `bold: ${String(text.className.includes("font-semibold"))}, accent text: ${String(text.className.includes("mention"))}, dot: ${String(dot)}`;
}

it("in a channel, a thread's summary says how many new replies are to you, after an accent dot", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-attention-summary";
  const reader = await followedThreads(channel);
  const close = openAt({ client: reader, hash: `#/channels/${channel}` });
  await inPane().findByRole("link", { name: /^2 replies, 2 new replies/u });
  const quiet = lookOf("2 replies, 2 new replies", "2 new replies");
  const mixed = lookOf("3 replies, 3 new replies · 1 to you", "3 new replies · 1 to you");
  const loud = lookOf("1 reply, 1 new reply to you", "1 new reply to you");

  expect([quiet, mixed, loud]).toStrictEqual([
    "bold: true, accent text: false, dot: false",
    "bold: true, accent text: false, dot: true",
    "bold: true, accent text: false, dot: true",
  ]);

  close();
});
