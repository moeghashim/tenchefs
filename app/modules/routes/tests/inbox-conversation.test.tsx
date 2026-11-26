import type { CookoutClient, EventStream, Message, MessageId } from "../../sdk/index.ts";
import { adminClient, anonymousClient, sessionOf } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inConversation, inPane, inSidebar, inThread } from "./regions.ts";
import { rowsOf, subscribedReader } from "./inbox-reader.ts";
import { conversationOpened } from "./view-opened.ts";
import { handReading } from "./hand-reading.ts";
import { openWithClockStopped } from "./clock.ts";
import { watched } from "./watched.ts";

const NONE = 0;
const TWO_EARLIER = ["Earlier one", "Earlier two"] as const;
const ONE = 1;
const READ_AFTER = 2000;

interface NewsThread {
  readonly channel: string;
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
  readonly parent: Message;
  readonly address: string;
}

async function replied(thread: Omit<NewsThread, "address">, text: string): Promise<Message> {
  const { message } = await thread.poster.createMessage({
    channel: thread.channel,
    replyTo: thread.parent.id,
    text,
  });
  return message;
}

async function earlierReplies(thread: Omit<NewsThread, "address">, texts: readonly string[]): Promise<MessageId> {
  const [first = "", ...rest] = texts;
  const { id } = await replied(thread, first);
  if (rest.length === NONE) {
    return id;
  }
  const last = await earlierReplies(thread, rest);
  return last;
}

async function threadWithNews(channel: string, earlierOnes: readonly string[] = TWO_EARLIER): Promise<NewsThread> {
  const { poster, reader } = await subscribedReader(channel);
  const { message: parent } = await poster.createMessage({ channel, text: "Deploy at noon?" });
  await reader.follow(parent.id);
  const thread = { channel, parent, poster, reader };
  await reader.ack(await earlierReplies(thread, earlierOnes));
  const { id: first } = await replied(thread, "Unread one");
  await replied(thread, "Unread two");
  return { ...thread, address: `#/inbox/${channel}/${String(parent.id)}/messages/${String(first)}` };
}

function shownTexts(): readonly string[] {
  return ["Deploy at noon?", "Earlier one", "Earlier two", "Unread one", "Unread two"].filter(
    (text) => within(inConversation().element()).queryByText(text) !== null,
  );
}

async function conversationShown(): Promise<readonly string[]> {
  await inConversation().findByText("Unread two");
  return shownTexts();
}

async function threadReadBy(reader: CookoutClient, parent: Message): Promise<void> {
  await waitFor(async () => {
    const inbox = await reader.inbox();

    expect(inbox.items.filter((item) => item.message.kind === "reply" && item.parent.id === parent.id)).toHaveLength(
      NONE,
    );
  });
}

function currentRows(label: string): readonly string[] {
  const hrefs: string[] = [];
  for (const link of within(screen.getByRole("list", { name: label })).getAllByRole("link", { current: "page" })) {
    hrefs.push(link.getAttribute("href") ?? "");
  }
  return hrefs;
}

const OPENED_AT = /\/messages\/\d+$/u;

function rowsAt(label: string, address: string): readonly string[] {
  const thread = `${address.replace(OPENED_AT, "")}/`;
  return rowsOf(label).filter((row) => row.startsWith(thread));
}

function isUnreadRow(row: string): boolean {
  return row.includes("2 new");
}

async function threadRowClicked(): Promise<string> {
  const activity = await screen.findByRole("list", { name: "Activity" });
  const empty = await inConversation().findByText("Pick a conversation");
  fireEvent.click(within(activity).getByRole("link", { name: /New reply in a thread you follow/u }));
  return empty.textContent;
}

interface Watching {
  readonly thread: NewsThread;
  readonly advance: (millis: number) => void;
  readonly close: () => Promise<void>;
}

async function watchedAt(channel: string, hashOf: (thread: NewsThread) => string): Promise<Watching> {
  const thread = await threadWithNews(channel);
  const { live, stream } = watched(thread.reader);
  const { advance, reading } = handReading();
  const unmount = openWithClockStopped({ client: thread.reader, hash: hashOf(thread), live, reading });
  const events: EventStream = await stream;
  return {
    advance,
    close: async () => {
      unmount();
      await events.close();
    },
    thread,
  };
}

async function secondThread(thread: NewsThread): Promise<void> {
  const { message: other } = await thread.poster.createMessage({ channel: thread.channel, text: "Lunch?" });
  await thread.reader.follow(other.id);
  await replied({ ...thread, parent: other }, "Pizza");
}

async function selectedAndRead({ advance, thread }: Watching): Promise<readonly string[]> {
  fireEvent.click(await inPane().findByRole("link", { name: /Unread two/u }));
  await conversationShown();
  advance(READ_AFTER);
  await threadReadBy(thread.reader, thread.parent);
  await waitFor(() => {
    expect(rowsAt("Activity", thread.address).filter((row) => isUnreadRow(row))).toHaveLength(NONE);
  });
  return rowsAt("Activity", thread.address);
}

async function otherSelected(thread: NewsThread): Promise<void> {
  fireEvent.click(inPane().getByRole("link", { name: /Pizza/u }));
  await inConversation().findByText("Lunch?");
  await waitFor(() => {
    expect(rowsAt("Activity", thread.address)).toHaveLength(NONE);
  });
}

it("clicking a thread row shows its first message, how many replies were read, and the unread ones in full", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await threadWithNews("web-conversation");
  const unmount = openWithClockStopped({ client: thread.reader, hash: "#/inbox" });
  const empty = await threadRowClicked();
  const shown = await conversationShown();
  fireEvent.click(inConversation().getByRole("button", { name: "2 earlier replies" }));
  await inConversation().findByText("Earlier one");

  expect([empty, globalThis.location.hash, shown, shownTexts()]).toStrictEqual([
    "Pick a conversation",
    thread.address,
    ["Deploy at noon?", "Unread one", "Unread two"],
    ["Deploy at noon?", "Earlier one", "Earlier two", "Unread one", "Unread two"],
  ]);

  unmount();
});

it("opening a thread row's address shows its conversation, with the row marked as current", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await threadWithNews("web-conversation-address");
  const { close: unmount } = await conversationOpened({ client: thread.reader, hash: thread.address });
  const shown = await conversationShown();

  expect([shown, inConversation().getByRole("button", { name: "2 earlier replies" }).textContent]).toStrictEqual([
    ["Deploy at noon?", "Unread one", "Unread two"],
    "2 earlier replies",
  ]);
  expect([
    currentRows("Activity"),
    inSidebar()
      .getByRole("link", { name: /^Inbox/u })
      .getAttribute("aria-current"),
  ]).toStrictEqual([[thread.address], "page"]);

  unmount();
});

it("a reply posted by someone else appears live in the open conversation", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close, thread } = await watchedAt("web-conversation-live", (each) => each.address);
  await conversationShown();
  await replied(thread, "Arrived live");
  const arrived = await inConversation().findByText("Arrived live");

  expect(arrived.textContent).toBe("Arrived live");

  await close();
});

it("the selected row stays in its section, muted, once read, and moves to Earlier when another row is selected", {
  timeout: 8000,
}, async () => {
  expect.hasAssertions();

  const watching = await watchedAt("web-conversation-held", () => "#/inbox");
  const { close, thread } = watching;
  await secondThread(thread);
  const held = await selectedAndRead(watching);
  await otherSelected(thread);

  expect([held.length, held.filter((row) => isUnreadRow(row)), rowsAt("Earlier", thread.address).length]).toStrictEqual(
    [ONE, [], ONE],
  );

  await close();
});

it("open thread goes to the thread's channel with its panel open", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const thread = await threadWithNews("web-conversation-open", ["Earlier one"]);
  const { close: unmount } = await conversationOpened({ client: thread.reader, hash: thread.address });
  await inConversation().findByRole("button", { name: "1 earlier reply" });
  fireEvent.click(inConversation().getByRole("link", { name: "Open thread" }));
  await inThread().findByText("Unread two");

  expect(globalThis.location.hash).toBe(`#/channels/${thread.channel}/threads/${String(thread.parent.id)}`);

  unmount();
});

it("an unknown thread's address says there is nothing there, beside the list", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const thread = await threadWithNews("web-conversation-unknown");
  const unmount = openWithClockStopped({ client: thread.reader, hash: `#/inbox/${thread.channel}/999999` });
  const nothing = await inConversation().findByText("Nothing here");
  const list = await inPane().findByRole("list", { name: "Activity" });

  expect([nothing.textContent, list.tagName]).toStrictEqual(["Nothing here", "UL"]);

  unmount();
});

it("a thread address that isn't a message ID is no page", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const unmount = openWithClockStopped({ client: adminClient(), hash: "#/inbox/general/first" });
  const missing = await inPane().findByText("No page has this address.");

  expect(missing.textContent).toBe("No page has this address.");

  unmount();
});

it("a conversation that can't be read says why", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const unmount = openWithClockStopped({
    client: anonymousClient(),
    hash: "#/inbox/general/1",
    session: sessionOf(adminClient()),
  });
  const alert = await inConversation().findByRole("alert");

  expect(alert.textContent).toMatch(/^Couldn't load the thread \(\w+\): /u);

  unmount();
});
