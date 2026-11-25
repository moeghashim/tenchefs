import type { CookoutClient, EventStream, Message } from "../../sdk/index.ts";
import { expect, it } from "vitest";
import { inConversation, inSidebar } from "./regions.ts";
import { inboxOpened, rowsOf, subscribedReader } from "./inbox-reader.ts";
import { screen, waitFor, within } from "@testing-library/react";
import { agentShown } from "./identities.ts";
import { watched } from "./watched.ts";

interface Thread {
  readonly channel: string;
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
  readonly parent: Message;
  readonly mention: Message;
}

async function threadWithNews(channel: string): Promise<Thread> {
  const { poster, reader } = await subscribedReader(channel);
  const { message: parent } = await poster.createMessage({ channel, text: "Deploy at noon?" });
  await reader.follow(parent.id);
  await reader.ack(parent.id);
  const { message: mention } = await poster.createMessage({
    channel,
    replyTo: parent.id,
    text: `@${channel}-reader look`,
  });
  await poster.createMessage({ channel, replyTo: parent.id, text: "Two" });
  return { channel, mention, parent, poster, reader };
}

interface InboxOf {
  readonly channel: string;
  readonly reader: CookoutClient;
}

async function openInbox({ channel, reader }: InboxOf, hash = "#/inbox"): Promise<() => Promise<void>> {
  const { live, stream } = watched(reader);
  const { unmount } = await inboxOpened({ author: `${channel}-poster`, hash, live, reader });
  await screen.findByRole("list", { name: "Earlier" });
  const events: EventStream = await stream;
  return async () => {
    unmount();
    await events.close();
  };
}

function inboxBadges(): readonly string[] {
  const link = inSidebar().getByRole("link", { name: /^Inbox/u });
  const badges: string[] = [];
  for (const label of within(link).queryAllByText(/^\d+ (?:unread|for you)$/u)) {
    badges.push(label.textContent);
  }
  return badges;
}

const CLOSED = "Closed";

interface Look {
  readonly marker: string;
  readonly marks: number;
}

const OPEN: Look = { marker: "", marks: 0 };
const MARKED: Look = { marker: CLOSED, marks: 1 };

function shownWith({ channel, mention, parent }: Thread, { marker }: Look): readonly unknown[] {
  return [
    [
      `#/inbox/${channel}/${String(parent.id)}/messages/${String(mention.id)} Mentioned you${agentShown(`${channel}-poster`)}replied in a thread in#${channel}${marker}2 newjust nowre: Deploy at noon?Two`,
    ],
    ["1 unread", "1 for you"],
  ];
}

async function shown({ marks }: Look): Promise<readonly unknown[]> {
  await screen.findByRole("heading", { level: 2, name: "For you 1" });
  await waitFor(() => {
    expect(within(screen.getByRole("list", { name: "For you" })).queryAllByText(CLOSED)).toHaveLength(marks);
  });
  return [rowsOf("For you"), inboxBadges()];
}

it("an unread reply in a thread closed elsewhere stays in For you, marked Closed, and still counts", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await threadWithNews("web-closed-live");
  const close = await openInbox(thread);

  await expect(shown(OPEN)).resolves.toStrictEqual(shownWith(thread, OPEN));

  await thread.poster.closeThread(thread.parent.id);

  await expect(shown(MARKED)).resolves.toStrictEqual(shownWith(thread, MARKED));

  await close();
});

it("an Inbox loaded with a thread already closed shows its unread items, marked Closed", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await threadWithNews("web-closed-load");
  await thread.poster.closeThread(thread.parent.id);
  const close = await openInbox(thread);

  await expect(shown(MARKED)).resolves.toStrictEqual(shownWith(thread, MARKED));

  await close();
});

it("reopening a closed thread takes the Closed marker off its row, and the row stays", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await threadWithNews("web-closed-reopen");
  await thread.poster.closeThread(thread.parent.id);
  const close = await openInbox(thread);
  await shown(MARKED);

  await thread.poster.reopenThread(thread.parent.id);

  await expect(shown(OPEN)).resolves.toStrictEqual(shownWith(thread, OPEN));

  await close();
});

async function reactedInClosedThread(channel: string): Promise<InboxOf> {
  const { poster, reader } = await subscribedReader(channel);
  const { message: parent } = await poster.createMessage({ channel, text: "Deploy at noon?" });
  const { message: reply } = await reader.createMessage({ channel, replyTo: parent.id, text: "Done" });
  await reader.ack(parent.id);
  await reader.ack(reply.id);
  await poster.react(reply.id, "thumbs_up");
  await poster.closeThread(parent.id);
  return { channel, reader };
}

it("a reaction to your reply in a closed thread shows in For you, marked Closed", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-closed-reacted";
  const close = await openInbox(await reactedInClosedThread(channel));
  const forYou = within(await screen.findByRole("list", { name: "For you" }));

  expect([
    forYou.getByText(`@${channel}-poster reacted with 👍`).textContent,
    forYou.getAllByText(CLOSED).length,
  ]).toStrictEqual([`@${channel}-poster reacted with 👍`, MARKED.marks]);

  await close();
});

it("opening a closed thread's row shows the thread in the conversation", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const thread = await threadWithNews("web-closed-open");
  await thread.poster.closeThread(thread.parent.id);
  const close = await openInbox(thread, `#/inbox/${thread.channel}/${String(thread.parent.id)}`);

  await expect(inConversation().findByText("Two")).resolves.toBeInstanceOf(HTMLElement);

  await close();
});
