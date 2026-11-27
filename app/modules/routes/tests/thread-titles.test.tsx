import type { CookoutClient, CookoutEvent, EventStream, MessageId } from "../../sdk/index.ts";
import { adminClient, newIdentity } from "./identities.ts";
import { expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { WatchedLive } from "../../testing/web.ts";
import { feedOpened } from "./feed.ts";
import { viewOpened } from "./view-opened.ts";
import { watched } from "./watched.ts";

interface Board {
  readonly channel: string;
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
}

async function boardOf(channel: string): Promise<Board> {
  const poster = await newIdentity({ kind: "human", name: `${channel}-ada` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-grace` });
  await adminClient().createChannel({ name: channel });
  return { channel, poster: poster.client, reader: reader.client };
}

interface Titled {
  readonly board: Board;
  readonly text: string;
  readonly title: string;
}

async function titledPost({ board, text, title }: Titled): Promise<void> {
  const { message } = await board.poster.createMessage({ channel: board.channel, text });
  await board.poster.setThreadTitle(message.id, title);
}

type Shown = () => HTMLElement;

function articleIn(feed: Shown, text: string): HTMLElement {
  for (const article of within(feed()).getAllByRole("article")) {
    if (article.textContent.includes(text)) {
      return article;
    }
  }
  throw new Error(`No message says ${text}`);
}

async function articleSaying(text: string): Promise<Shown> {
  const feed = await screen.findByRole("feed", { name: "Messages" });
  const found = await vi.waitFor(() => articleIn(() => feed, text));
  return () => found;
}

function headingsIn(article: Shown): readonly string[] {
  const texts: string[] = [];
  for (const heading of within(article()).queryAllByRole("heading", { level: 3 })) {
    texts.push(heading.textContent);
  }
  return texts;
}

it("a titled thread shows its title as a heading above its author's name, and an untitled one shows none", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const board = await boardOf("web-title-heading");
  const { channel, reader } = board;
  await board.poster.createMessage({ channel, text: "Untitled." });
  await titledPost({ board, text: "Who's on call?", title: "On call this week" });
  const { close } = await feedOpened({ hash: `#/channels/${channel}`, reader });
  const titled = await articleSaying("Who's on call?");

  expect({
    row: titled().textContent.startsWith("On call this weekweb-title-heading-ada"),
    titled: headingsIn(titled),
    untitled: headingsIn(await articleSaying("Untitled.")),
  }).toStrictEqual({ row: true, titled: ["On call this week"], untitled: [] });

  close();
});

it("a titled message after one by the same author still shows its author's name", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const board = await boardOf("web-title-ungrouped");
  const { channel, reader } = board;
  await board.poster.createMessage({ channel, text: "First." });
  await titledPost({ board, text: "Second.", title: "A new subject" });
  const { close } = await feedOpened({ hash: `#/channels/${channel}`, reader });
  const second = await articleSaying("Second.");

  expect(within(second()).queryByRole("link", { name: "web-title-ungrouped-ada" })).not.toBeNull();

  close();
});

it("a title shows Markdown and an @name as typed", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const board = await boardOf("web-title-plain");
  const { channel, reader } = board;
  await titledPost({ board, text: "Plain?", title: "**bold** for @web-title-plain-grace" });
  const { close } = await feedOpened({ hash: `#/channels/${channel}`, reader });
  const article = await articleSaying("Plain?");
  const heading = within(article()).getByRole("heading", { level: 3 });

  expect({
    links: within(heading).queryAllByRole("link"),
    strong: heading.querySelector("strong"),
    text: heading.textContent,
  }).toStrictEqual({ links: [], strong: null, text: "**bold** for @web-title-plain-grace" });

  close();
});

interface TitleChange {
  readonly board: Board;
  readonly heard: WatchedLive["heard"];
  readonly parent: MessageId;
}

function titleHeard(parent: MessageId, title: string): (event: CookoutEvent) => boolean {
  return (event) => event.type === "thread" && event.parent.id === parent && (event.parent.title ?? "") === title;
}

async function headingsShow(text: string, shown: readonly string[]): Promise<void> {
  await vi.waitFor(async () => {
    expect(headingsIn(await articleSaying(text))).toStrictEqual(shown);
  });
}

async function titleShows(change: TitleChange, title: string, shown: readonly string[]): Promise<void> {
  await change.board.poster.setThreadTitle(change.parent, title);
  await change.heard(titleHeard(change.parent, title));
  await headingsShow("Deploy?", shown);
}

interface OpenedLive {
  readonly change: TitleChange;
  readonly close: () => Promise<void>;
}

async function openLive(board: Board): Promise<OpenedLive> {
  const { message } = await board.poster.createMessage({ channel: board.channel, text: "Deploy?" });
  const { heard, live, stream } = watched(board.reader);
  const hash = `#/channels/${board.channel}`;
  const { close } = await viewOpened({ client: board.reader, hash, live, waitingOn: ["listMessages"] });
  const events: EventStream = await stream;
  await headingsShow("Deploy?", []);
  return {
    change: { board, heard, parent: message.id },
    close: async () => {
      close();
      await events.close();
    },
  };
}

it("a title set, changed and cleared by another identity shows, changes and goes live", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { change, close } = await openLive(await boardOf("web-title-live"));

  await titleShows(change, "Friday deploy", ["Friday deploy"]);
  await titleShows(change, "Monday deploy", ["Monday deploy"]);
  await titleShows(change, "", []);

  await close();
});
