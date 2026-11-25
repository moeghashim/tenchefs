import type { CookoutClient, EventStream, Message } from "../../sdk/index.ts";
import { agentShown, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { inboxOpened, rowsOf, subscribedReader } from "./inbox-reader.ts";
import type { ClientMethod } from "./answering.ts";
import type { OpenedInbox } from "./inbox-reader.ts";
import { inPane } from "./regions.ts";
import { watched } from "./watched.ts";

const NONE = 0;
const TWO_A_PAGE = 2;
const FULL_PAGE = 50;

interface Started {
  readonly channel: string;
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
  readonly parent: Message;
}

interface Replies {
  readonly first: Message;
  readonly last: Message;
  readonly after: readonly Message[];
}

type Thread = Started & Replies;

interface Watching {
  readonly answered: OpenedInbox["answered"];
  readonly close: () => Promise<void>;
}

async function repliesIn(thread: Started, text: string, ...rest: readonly string[]): Promise<Replies> {
  const { message } = await thread.poster.createMessage({ channel: thread.channel, replyTo: thread.parent.id, text });
  if (rest.length === NONE) {
    return { after: [], first: message, last: message };
  }
  const [next = "", ...more] = rest;
  const later = await repliesIn(thread, next, ...more);
  return { after: [later.first, ...later.after], first: message, last: later.last };
}

async function followedThread(channel: string, text: string, ...rest: readonly string[]): Promise<Thread> {
  const { poster, reader } = await subscribedReader(channel);
  const { message: parent } = await poster.createMessage({ channel, text: "Deploy at noon?" });
  await reader.follow(parent.id);
  await reader.ack(parent.id);
  const started = { channel, parent, poster, reader };
  return { ...started, ...(await repliesIn(started, text, ...rest)) };
}

async function watching({ channel, reader }: Started, pageSize: number): Promise<Watching> {
  const { live, stream } = watched(reader);
  const { answered, unmount } = await inboxOpened({ author: `${channel}-poster`, live, pageSize, reader });
  await screen.findByRole("list", { name: "Earlier" });
  const events: EventStream = await stream;
  return {
    answered,
    close: async () => {
      unmount();
      await events.close();
    },
  };
}

interface TwoThreads extends Watching {
  readonly thread: Thread;
  readonly other: Message;
}

async function watchingTwoThreads(channel: string): Promise<TwoThreads> {
  const thread = await followedThread(channel, "One");
  const { poster, reader } = thread;
  const { message: other } = await reader.createMessage({ channel, text: "Tea?" });
  await poster.createMessage({ channel, text: "Lunch?" });
  return { ...(await watching(thread, FULL_PAGE)), other, thread };
}

async function readElsewhere(thread: Thread): Promise<readonly string[]> {
  await thread.reader.ack(thread.last.id);
  await waitFor(() => {
    expect(screen.queryByRole("list", { name: "Activity" })).toBeNull();
  });
  return rowsOf("Earlier");
}

interface Pressing {
  readonly answered: OpenedInbox["answered"];
  readonly button: string;
  readonly method: ClientMethod;
}

async function pressedAndAnswered({ answered, button, method }: Pressing): Promise<void> {
  fireEvent.click(inPane().getByRole("button", { name: button }));
  await answered(method);
}

async function postedTwice({ channel, poster }: Started): Promise<void> {
  await poster.createMessage({ channel, text: "Lunch?" });
  await poster.createMessage({ channel, text: "Tea?" });
}

function threadRow({ channel, first, parent }: Thread, row: string, opened: Message = first): string {
  return `#/inbox/${channel}/${String(parent.id)}/messages/${String(opened.id)} ${row}`;
}

function followedRow(thread: Thread, row: string, opened: Message = thread.first): string {
  const { channel } = thread;
  return threadRow(
    thread,
    `New reply in a thread you follow${agentShown(`${channel}-poster`)}replied in a thread in#${channel}${row}`,
    opened,
  );
}

function channelRow(channel: string, row: string): string {
  return `#/inbox/${channel} New in #${channel}${agentShown(`${channel}-poster`)}posted in#${channel}${row}`;
}

it("unread replies in one thread share one row, and new posts in one channel share another", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await followedThread("web-rows", "One", "Two");
  const { channel, reader } = thread;
  const other = await newIdentity({ kind: "human", name: `${channel}-other` });
  await other.client.createMessage({ channel, replyTo: thread.parent.id, text: "Three" });
  await postedTwice(thread);
  const { unmount } = await inboxOpened({ author: `${channel}-poster`, reader });
  await screen.findByRole("heading", { level: 2, name: "Activity 2" });

  expect([rowsOf("Activity"), screen.queryByRole("list", { name: "For you" })]).toStrictEqual([
    [
      channelRow(channel, "2 newjust nowTea?"),
      threadRow(
        thread,
        `New reply in a thread you follow${channel}-otherreplied in a thread in#${channel}3 newjust nowre: Deploy at noon?Three`,
      ),
    ],
    null,
  ]);

  unmount();
});

it("a thread with one reply that mentions the reader is one row under For you, leading with the mention", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await followedThread("web-rows-mention", "@web-rows-mention-reader look", "Two", "Three");
  const { unmount } = await inboxOpened({ author: `${thread.channel}-poster`, reader: thread.reader });
  await screen.findByRole("heading", { level: 2, name: "For you 1" });

  expect([rowsOf("For you"), screen.queryByRole("list", { name: "Activity" })]).toStrictEqual([
    [
      threadRow(
        thread,
        `Mentioned you${agentShown(`${thread.channel}-poster`)}replied in a thread in#${thread.channel}3 newjust nowre: Deploy at noon?Three`,
      ),
    ],
    null,
  ]);

  unmount();
});

it("a live reply joins its thread's row and moves it to the top, and a reply in a new thread adds a row", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, other, thread } = await watchingTwoThreads("web-rows-live");
  const { channel, poster } = thread;
  await repliesIn(thread, "Two");
  await screen.findByText("2 new");
  const { message: yes } = await poster.createMessage({ channel, replyTo: other.id, text: "Yes" });
  await screen.findByRole("heading", { level: 2, name: "For you 1" });

  expect([rowsOf("Activity"), rowsOf("For you")]).toStrictEqual([
    [followedRow(thread, "2 newjust nowre: Deploy at noon?Two"), channelRow(channel, "just nowLunch?")],
    [
      `#/inbox/${channel}/${String(other.id)}/messages/${String(yes.id)} Replied to you${agentShown(`${channel}-poster`)}replied in a thread in#${channel}just nowre: Tea?Yes`,
    ],
  ]);

  await close();
});

it("a row read in another session moves to Earlier live, and marking it unread there brings it back", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await followedThread("web-rows-elsewhere", "One", "Two");
  const { close } = await watching(thread, FULL_PAGE);
  await screen.findByRole("heading", { level: 2, name: "Activity 1" });

  const read = await readElsewhere(thread);
  await thread.reader.markUnread(thread.first.id);
  await screen.findByRole("heading", { level: 2, name: "Activity 1" });

  expect([read, rowsOf("Activity"), rowsOf("Earlier")]).toStrictEqual([
    [followedRow(thread, "just nowre: Deploy at noon?Two"), channelRow(thread.channel, "just nowDeploy at noon?")],
    [followedRow(thread, "2 newjust nowre: Deploy at noon?Two")],
    [channelRow(thread.channel, "just nowDeploy at noon?")],
  ]);

  await close();
});

it("marking all as read empties For you and Activity, and their rows show in Earlier", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const thread = await followedThread("web-rows-mark-all", "@web-rows-mark-all-reader look", "Two");
  const { channel, reader } = thread;
  await postedTwice(thread);
  const { answered, unmount } = await inboxOpened({ author: `${channel}-poster`, reader });
  await screen.findByRole("heading", { level: 2, name: "For you 1" });

  await pressedAndAnswered({ answered, button: "Mark all as read", method: "ackAll" });
  await screen.findByText("You're all caught up.");

  expect(rowsOf("Earlier")).toStrictEqual([
    channelRow(channel, "just nowTea?"),
    threadRow(
      thread,
      `Mentioned you${agentShown(`${channel}-poster`)}replied in a thread in#${channel}just nowre: Deploy at noon?Two`,
    ),
  ]);

  unmount();
});

it("earlier groups read messages by thread or channel, and a thread across two pages stays one row", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await followedThread("web-rows-earlier", "One", "Two", "Three");
  await thread.reader.ack(thread.last.id);
  const { answered, close } = await watching(thread, TWO_A_PAGE);
  const before = rowsOf("Earlier");
  const [second = thread.first] = thread.after;

  await pressedAndAnswered({ answered, button: "Show earlier", method: "inboxHistory" });
  await screen.findByText("That's everything.");

  expect([before, rowsOf("Earlier")]).toStrictEqual([
    [followedRow(thread, "just nowre: Deploy at noon?Three", second)],
    [followedRow(thread, "just nowre: Deploy at noon?Three"), channelRow(thread.channel, "just nowDeploy at noon?")],
  ]);

  await close();
});
