import type { CookoutClient, EventStream, Message } from "../../sdk/index.ts";
import { expect, it } from "vitest";
import { inboxOpened, rowsOf, subscribedReader } from "./inbox-reader.ts";
import { screen, waitFor } from "@testing-library/react";
import { agentShown } from "./identities.ts";
import { watched } from "./watched.ts";

const TITLE = "**Deploy** plan with @grace";

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

async function openInbox({ channel, reader }: InboxOf): Promise<() => Promise<void>> {
  const { live, stream } = watched(reader);
  const { unmount } = await inboxOpened({ author: `${channel}-poster`, live, reader });
  await screen.findByRole("list", { name: "Earlier" });
  const events: EventStream = await stream;
  return async () => {
    unmount();
    await events.close();
  };
}

interface Shown {
  readonly context: string;
  readonly marker?: string;
}

function replyRow({ channel, mention, parent }: Thread, { context, marker = "" }: Shown): readonly string[] {
  return [
    `#/inbox/${channel}/${String(parent.id)}/messages/${String(mention.id)} Mentioned you${agentShown(`${channel}-poster`)}replied in a thread in#${channel}${marker}2 newjust now${context}Two`,
  ];
}

async function forYouRows(expected: readonly string[]): Promise<readonly string[]> {
  await waitFor(() => {
    expect(rowsOf("For you")).toStrictEqual(expected);
  });
  return rowsOf("For you");
}

it("a reply's row in a titled thread shows the title, as typed, where it showed the top-level message", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await threadWithNews("web-titled-reply");
  await thread.poster.setThreadTitle(thread.parent.id, TITLE);
  const close = await openInbox(thread);
  const expected = replyRow(thread, { context: `re: ${TITLE}` });

  await expect(forYouRows(expected)).resolves.toStrictEqual(expected);

  await close();
});

it("an untitled thread's reply row still shows the start of its top-level message", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const thread = await threadWithNews("web-untitled-reply");
  const close = await openInbox(thread);
  const expected = replyRow(thread, { context: "re: Deploy at noon?" });

  await expect(forYouRows(expected)).resolves.toStrictEqual(expected);

  await close();
});

it("a closed titled thread's row says Closed beside the title", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const thread = await threadWithNews("web-titled-closed");
  await thread.poster.setThreadTitle(thread.parent.id, TITLE);
  await thread.poster.closeThread(thread.parent.id);
  const close = await openInbox(thread);
  const expected = replyRow(thread, { context: `re: ${TITLE}`, marker: "Closed" });

  await expect(forYouRows(expected)).resolves.toStrictEqual(expected);

  await close();
});

it("a title set, changed and cleared by another identity shows in the row without a reload", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await threadWithNews("web-titled-live");
  const close = await openInbox(thread);
  await forYouRows(replyRow(thread, { context: "re: Deploy at noon?" }));
  async function titled(title: string, context: string): Promise<readonly string[]> {
    await thread.poster.setThreadTitle(thread.parent.id, title);
    return forYouRows(replyRow(thread, { context }));
  }

  const set = await titled("Noon deploy", "re: Noon deploy");
  const changed = await titled("Afternoon deploy", "re: Afternoon deploy");
  const cleared = await titled("", "re: Deploy at noon?");

  expect([set, changed, cleared]).toStrictEqual([
    replyRow(thread, { context: "re: Noon deploy" }),
    replyRow(thread, { context: "re: Afternoon deploy" }),
    replyRow(thread, { context: "re: Deploy at noon?" }),
  ]);

  await close();
});

async function titledTopLevel(channel: string): Promise<InboxOf> {
  const { poster, reader } = await subscribedReader(channel);
  const { message: read } = await poster.createMessage({ channel, text: "Morning" });
  await reader.ack(read.id);
  const { message } = await poster.createMessage({ channel, text: `@${channel}-reader Deploy at noon?` });
  await poster.setThreadTitle(message.id, TITLE);
  return { channel, reader };
}

it("a titled top-level message's row shows its title", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const inbox = await titledTopLevel("web-titled-top");
  const close = await openInbox(inbox);
  await screen.findByRole("list", { name: "For you" });

  expect(rowsOf("For you")).toStrictEqual([
    expect.stringContaining(`just nowre: ${TITLE}@${inbox.channel}-reader Deploy at noon?`),
  ]);

  await close();
});
