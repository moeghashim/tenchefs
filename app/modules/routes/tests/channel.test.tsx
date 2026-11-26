import type { CookoutClient, InboxResponse, Message } from "../../sdk/index.ts";
import { adminClient, clientWith, newIdentity, revocableView } from "./identities.ts";
import { alertSaying, alertsShown } from "./alerts.ts";
import { expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { inPane } from "./regions.ts";
import { messagesIn } from "./messages.ts";
import { openWithClockStopped } from "./clock.ts";
import { viewOpened } from "./view-opened.ts";

const ONE_A_PAGE = 1;
const TWO_A_PAGE = 2;
const NONE = 0;
const FIRST = 0;
const REST = 1;

async function ackingWithALeftSession(token: string, name: string): Promise<CookoutClient> {
  const client = clientWith(token);
  const { agentSessionToken } = await client.join({ as: name });
  const session = clientWith(agentSessionToken);
  await session.leave();
  return { ...client, ack: session.ack };
}

async function post(channel: string, text: string): Promise<Message> {
  const { message } = await adminClient().createMessage({ channel, text });
  return message;
}

async function postInOrder(channel: string, texts: readonly string[]): Promise<void> {
  if (texts.length === NONE) {
    return;
  }
  await Promise.all(
    texts.slice(FIRST, REST).map(async (text) => {
      await post(channel, text);
    }),
  );
  await postInOrder(channel, texts.slice(REST));
}

async function channelWith(name: string, texts: readonly string[]): Promise<void> {
  await adminClient().createChannel({ name });
  await postInOrder(name, texts);
}

async function threadWithReplies(channel: string, replies: number): Promise<Message> {
  const parent = await post(channel, "First");
  await Promise.all(
    Array.from({ length: replies }, async () => {
      await adminClient().createMessage({ channel, replyTo: parent.id, text: "A reply" });
    }),
  );
  return parent;
}

async function subscribedTo(channel: string, client: CookoutClient): Promise<void> {
  await adminClient().createChannel({ name: channel });
  await client.subscribe(channel);
}

async function shownMessages(): Promise<readonly string[]> {
  const shown = await messagesIn("Messages");
  return shown;
}

async function inboxOnceEmpty(client: CookoutClient): Promise<InboxResponse | false> {
  const inbox = await client.inbox();
  return inbox.items.length === NONE && inbox;
}

it("the channel view shows the channel's top-level messages, oldest first, with their reply counts", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-channel-shows" });
  const parent = await threadWithReplies("web-channel-shows", TWO_A_PAGE);
  await postInOrder("web-channel-shows", ["Second", "Third"]);
  const close = openWithClockStopped({ client: adminClient(), hash: "#/channels/web-channel-shows" });

  const shown = await shownMessages();

  expect([
    shown,
    inPane()
      .getByRole("link", { name: /^2 replies/u })
      .getAttribute("href"),
  ]).toStrictEqual([
    ["adminFirst2 repliesLast reply just now →", "adminSecond", "Third"],
    `#/channels/web-channel-shows/threads/${String(parent.id)}`,
  ]);

  close();
});

it("a message with one reply says 1 reply", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-channel-one-reply" });
  await threadWithReplies("web-channel-one-reply", ONE_A_PAGE);
  const close = openWithClockStopped({ client: adminClient(), hash: "#/channels/web-channel-one-reply" });

  await expect(shownMessages()).resolves.toStrictEqual(["adminFirst1 replyLast reply just now →"]);

  close();
});

it('"Load older messages" loads the older messages, until there are none', { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await channelWith("web-channel-pages", ["One", "Two", "Three"]);
  const close = openWithClockStopped({
    client: adminClient(),
    hash: "#/channels/web-channel-pages",
    pageSize: TWO_A_PAGE,
  });
  const firstPage = await shownMessages();

  fireEvent.click(inPane().getByRole("button", { name: "Load older messages" }));
  await screen.findByText("One");

  expect([
    firstPage,
    await shownMessages(),
    inPane().queryByRole("button", { name: "Load older messages" }),
  ]).toStrictEqual([["adminTwo", "Three"], ["adminOne", "Two", "Three"], null]);

  close();
});

it('clicking "Load older messages" twice before it answers loads the older page once', { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await channelWith("web-channel-double-click", ["One", "Two", "Three"]);
  const close = openWithClockStopped({
    client: adminClient(),
    hash: "#/channels/web-channel-double-click",
    pageSize: TWO_A_PAGE,
  });
  await shownMessages();

  fireEvent.click(inPane().getByRole("button", { name: "Load older messages" }));
  fireEvent.click(inPane().getByRole("button", { name: "Load older messages" }));
  await screen.findByText("One");

  await expect(shownMessages()).resolves.toStrictEqual(["adminOne", "Two", "Three"]);

  close();
});

it("viewing a channel acks its newest top-level message, so its messages leave the inbox", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const reader = await newIdentity({ kind: "human", name: "web-channel-reader" });
  await subscribedTo("web-channel-read", reader.client);
  await postInOrder("web-channel-read", ["Older", "Newest"]);
  const before = await reader.client.inbox();
  const close = openWithClockStopped({ client: reader.client, hash: "#/channels/web-channel-read" });
  await shownMessages();

  const after = await vi.waitUntil(async () => {
    const inbox = await inboxOnceEmpty(reader.client);
    return inbox;
  });

  expect([before.items.map((item) => item.message.text), after.items]).toStrictEqual([["Older", "Newest"], []]);

  close();
});

it("a channel with nothing older says it is the start of the channel", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await channelWith("web-channel-empty", []);
  const close = openWithClockStopped({ client: adminClient(), hash: "#/channels/web-channel-empty" });

  const start = await screen.findByRole("heading", { level: 2, name: "Welcome to #web-channel-empty" });

  expect([
    start.textContent,
    screen.getByText("This is the start of the channel.").tagName,
    alertsShown(),
  ]).toStrictEqual(["Welcome to #web-channel-empty", "P", []]);

  close();
});

it("a channel that doesn't exist shows Nothing here", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = openWithClockStopped({ client: adminClient(), hash: "#/channels/web-channel-missing" });

  const heading = await screen.findByRole("heading", { level: 1, name: "Nothing here" });

  expect([heading.textContent, alertsShown()]).toStrictEqual(["Nothing here", []]);

  close();
});

it("a deleted channel shows Nothing here", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await channelWith("web-channel-deleted", ["Soon gone"]);
  await adminClient().deleteChannel("web-channel-deleted");
  const close = openWithClockStopped({ client: adminClient(), hash: "#/channels/web-channel-deleted" });

  const heading = await screen.findByRole("heading", { level: 1, name: "Nothing here" });

  expect(heading.textContent).toBe("Nothing here");

  close();
});

it("a refused ack says the channel couldn't be marked read", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await channelWith("web-channel-ack-refused", ["Hello"]);
  const agent = await newIdentity({ kind: "agent", name: "web-channel-left" });
  const client = await ackingWithALeftSession(agent.token, "web-channel-left");
  const { close } = await viewOpened({
    client,
    hash: "#/channels/web-channel-ack-refused",
    open: openWithClockStopped,
    waitingOn: ["ack"],
  });

  const alert = await alertSaying("Couldn't mark the channel read");

  expect(alert.textContent).toMatch(/^Couldn't mark the channel read \(agent_session_revoked\)/u);

  close();
});

it("a refused older page says so and keeps the messages shown", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await channelWith("web-channel-older-refused", ["A", "B"]);
  const reader = await revocableView({
    methods: ["listMessages"],
    revoked: "web-channel-rotated",
    viewer: "web-channel-viewer",
  });
  const close = openWithClockStopped({
    client: reader.client,
    hash: "#/channels/web-channel-older-refused",
    pageSize: ONE_A_PAGE,
  });
  await shownMessages();
  await reader.rotateToken();

  fireEvent.click(inPane().getByRole("button", { name: "Load older messages" }));
  const alert = await alertSaying("Couldn't load older messages");

  expect([alert.textContent, await shownMessages()]).toStrictEqual([
    expect.stringMatching(/^Couldn't load older messages \(token_revoked\)/u),
    ["adminB"],
  ]);

  close();
});
