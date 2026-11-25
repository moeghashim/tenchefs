import type { Answering, ClientMethod } from "./answering.ts";
import type { CookoutClient, EventStream, Message } from "../../sdk/index.ts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inConversation, inPane, inSidebar } from "./regions.ts";
import type { HandReading } from "./hand-reading.ts";
import { answering } from "./answering.ts";
import { clockStopped } from "./clock.ts";
import { expect } from "vitest";
import { handReading } from "./hand-reading.ts";
import { openAt } from "./render.tsx";
import { subscribedReader } from "./inbox-reader.ts";
import { watched } from "./watched.ts";

const NONE = 0;
const FIRST_REPLY = "Unread one";
const SECOND_REPLY = "Unread two";

interface ReadThread {
  readonly channel: string;
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
  readonly parent: Message;
  readonly address: string;
  readonly latest: Message;
}

interface Replying {
  readonly thread: Pick<ReadThread, "channel" | "parent" | "poster">;
  readonly text: string;
  readonly by?: CookoutClient;
}

async function replied({ by, text, thread }: Replying): Promise<Message> {
  const { message } = await (by ?? thread.poster).createMessage({
    channel: thread.channel,
    replyTo: thread.parent.id,
    text,
  });
  return message;
}

interface Starting {
  readonly channel: string;
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
  readonly text: string;
}

async function startedThread({ channel, poster, reader, text }: Starting): Promise<ReadThread> {
  const { message: parent } = await poster.createMessage({ channel, text });
  await reader.follow(parent.id);
  await reader.ack(parent.id);
  const started = { address: `#/inbox/${channel}/${String(parent.id)}`, channel, parent, poster, reader };
  const first = await replied({ text: `${FIRST_REPLY} in ${text}`, thread: started });
  const latest = await replied({ text: `${SECOND_REPLY} in ${text}`, thread: started });
  return { ...started, address: `${started.address}/messages/${String(first.id)}`, latest };
}

async function threadToRead(channel: string): Promise<ReadThread> {
  const { poster, reader } = await subscribedReader(channel);
  const thread = await startedThread({ channel, poster, reader, text: "Deploy at noon?" });
  return thread;
}

async function otherThread(thread: ReadThread): Promise<ReadThread> {
  const other = await startedThread({ ...thread, text: "Lunch?" });
  return other;
}

async function unreadIn(thread: ReadThread): Promise<number> {
  const inbox = await thread.reader.inbox();
  return inbox.items.filter((item) => item.message.kind === "reply" && item.parent.id === thread.parent.id).length;
}

interface Counting {
  readonly thread: ReadThread;
  readonly count: number;
}

async function unreadAtLast({ count, thread }: Counting): Promise<number> {
  await waitFor(async () => {
    await expect(unreadIn(thread)).resolves.toBe(count);
  });
  return count;
}

async function readAtLast(thread: ReadThread): Promise<number> {
  const count = await unreadAtLast({ count: NONE, thread });
  return count;
}

function sidebarCounts(channel: string): readonly string[] {
  const link = inSidebar().getByRole("link", { name: new RegExp(`^#${channel}(?![a-z-])`, "u") });
  const counts: string[] = [];
  for (const count of within(link).queryAllByText(/^\d+ (?:unread|for you)$/u)) {
    counts.push(count.textContent);
  }
  return counts;
}

async function sidebarCleared(channel: string): Promise<readonly string[]> {
  await waitFor(() => {
    expect(sidebarCounts(channel)).toStrictEqual([]);
  });
  return sidebarCounts(channel);
}

interface RowLookup {
  readonly label: string;
  readonly thread: ReadThread;
}

function rowsAt({ label, thread }: RowLookup): readonly string[] {
  const list = screen.queryByRole("list", { name: label });
  const rows: string[] = [];
  if (list === null) {
    return rows;
  }
  for (const row of within(list).getAllByRole("listitem")) {
    if (row.querySelector(`a[href="${thread.address}"]`) !== null) {
      rows.push(row.textContent);
    }
  }
  return rows;
}

async function shown(text: string): Promise<string> {
  const found = await inConversation().findByText(text);
  return found.textContent;
}

interface Answered {
  readonly answered: Answering["answered"];
}

interface Showing {
  readonly opened: Answered;
  readonly text: string;
}

async function answeredAndShown({ opened, text }: Showing): Promise<string> {
  await opened.answered("getThread");
  const found = await shown(text);
  return found;
}

interface Selecting {
  readonly opened: Answered;
  readonly thread: ReadThread;
}

async function rowSelected({ opened, thread }: Selecting): Promise<string> {
  const latest = `${SECOND_REPLY} in ${thread.parent.text}`;
  fireEvent.click(await inPane().findByRole("link", { name: (name) => name.includes(latest) }));
  const text = await answeredAndShown({ opened, text: latest });
  return text;
}

async function arrived({ text, thread }: Replying): Promise<string> {
  await replied({ text, thread });
  const found = await shown(text);
  return found;
}

function clicked(name: string): void {
  fireEvent.click(inConversation().getByRole("button", { name }));
}

interface Pressing {
  readonly opened: Answered;
  readonly button: string;
  readonly methods: readonly ClientMethod[];
}

async function pressedAndAnswered({ button, methods, opened }: Pressing): Promise<void> {
  clicked(button);
  await Promise.all(
    methods.map(async (method) => {
      await opened.answered(method);
    }),
  );
}

interface Acking {
  readonly acked: () => Promise<void>;
  readonly ackedAt: (message: Message) => Promise<void>;
  readonly client: CookoutClient;
}

function acking(client: CookoutClient): Acking {
  let answered = Promise.withResolvers<boolean>();
  const acks = new Map<Message["id"], PromiseWithResolvers<boolean>>();
  function ackOf(id: Message["id"]): PromiseWithResolvers<boolean> {
    const known = acks.get(id) ?? Promise.withResolvers<boolean>();
    acks.set(id, known);
    return known;
  }
  return {
    acked: async () => {
      await answered.promise;
      answered = Promise.withResolvers<boolean>();
    },
    ackedAt: async (message) => {
      await ackOf(message.id).promise;
    },
    client: {
      ...client,
      ack: async (messageId) => {
        const answer = await client.ack(messageId);
        answered.resolve(true);
        ackOf(messageId).resolve(true);
        return answer;
      },
    },
  };
}

interface Opened extends Omit<HandReading, "reading"> {
  readonly answered: Answering["answered"];
  readonly close: () => Promise<void>;
  readonly read: () => Promise<number>;
  readonly unreadAfter: (millis: number) => Promise<number>;
  readonly readAfter: (millis: number) => Promise<number>;
}

interface Opening {
  readonly thread: ReadThread;
  readonly hash: string;
  readonly waitingOn?: readonly ClientMethod[];
}

async function openReading({ hash, thread, waitingOn = [] }: Opening): Promise<Opened> {
  const { advance, page, reading } = handReading();
  const { live, stream } = watched(thread.reader);
  clockStopped();
  const { acked, ackedAt, client: ackingClient } = acking(thread.reader);
  const { answered, client } = answering(ackingClient);
  const unmount = openAt({ client, hash, live, reading });
  const events: EventStream = await stream;
  await Promise.all(
    waitingOn.map(async (method) => {
      await answered(method);
    }),
  );
  return {
    advance,
    answered,
    close: async () => {
      unmount();
      await events.close();
    },
    page,
    read: async () => {
      await ackedAt(thread.latest);
      const count = await unreadIn(thread);
      return count;
    },
    readAfter: async (millis) => {
      advance(millis);
      await acked();
      const count = await unreadIn(thread);
      return count;
    },
    unreadAfter: async (millis) => {
      advance(millis);
      const count = await unreadIn(thread);
      return count;
    },
  };
}

export {
  type ReadThread,
  answeredAndShown,
  arrived,
  clicked,
  openReading,
  otherThread,
  pressedAndAnswered,
  readAtLast,
  replied,
  rowSelected,
  rowsAt,
  shown,
  sidebarCleared,
  sidebarCounts,
  threadToRead,
  unreadAtLast,
};
