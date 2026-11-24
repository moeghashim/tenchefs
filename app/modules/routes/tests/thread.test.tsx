import type { CookoutClient, InboxResponse, Message } from "../../sdk/index.ts";
import { adminClient, clientWith, newIdentity, refusalNoticed, revocableView } from "./identities.ts";
import { expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { messagesIn, parentShown } from "./messages.ts";
import { alertsShown } from "./alerts.ts";
import { createCookoutClient } from "../../sdk/index.ts";
import { inThread } from "./regions.ts";
import { openAt } from "./render.tsx";

const NONE = 0;

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

async function replyTo(parent: Message, text: string): Promise<void> {
  await adminClient().createMessage({ channel: parent.channel, replyTo: parent.id, text });
}

async function twoReplies(parent: Message): Promise<void> {
  await replyTo(parent, "First reply");
  await replyTo(parent, "Second reply");
}

async function threadIn(channel: string): Promise<Message> {
  await adminClient().createChannel({ name: channel });
  const parent = await post(channel, "The parent");
  await twoReplies(parent);
  return parent;
}

async function followedThreadIn(channel: string, client: CookoutClient): Promise<Message> {
  await adminClient().createChannel({ name: channel });
  const parent = await post(channel, "The parent");
  await client.follow(parent.id);
  await twoReplies(parent);
  return parent;
}

function sendReply(text: string): void {
  fireEvent.change(screen.getByRole("textbox", { name: "Reply" }), { target: { value: text } });
  fireEvent.click(inThread().getByRole("button", { name: "Send" }));
}

function hashOf(parent: Message): string {
  return `#/channels/${parent.channel}/threads/${String(parent.id)}`;
}

async function shownReplies(): Promise<readonly string[]> {
  const shown = await messagesIn("Replies");
  return shown;
}

async function inboxOnceEmpty(client: CookoutClient): Promise<InboxResponse | false> {
  const inbox = await client.inbox();
  return inbox.items.length === NONE && inbox;
}

it("the thread view shows the parent message and its replies, oldest first", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const parent = await threadIn("web-thread-shows");
  const close = openAt({ client: adminClient(), hash: hashOf(parent) });

  const replies = await shownReplies();

  expect([await parentShown(), replies]).toStrictEqual(["adminThe parent", ["adminFirst reply", "Second reply"]]);

  close();
});

it("opening a thread acks its latest message, so the thread leaves the inbox", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const reader = await newIdentity({ kind: "human", name: "web-thread-reader" });
  const parent = await followedThreadIn("web-thread-read", reader.client);
  const before = await reader.client.inbox();
  const close = openAt({ client: reader.client, hash: hashOf(parent) });
  await shownReplies();

  const after = await vi.waitUntil(async () => {
    const inbox = await inboxOnceEmpty(reader.client);
    return inbox;
  });

  expect([before.items.map((item) => item.message.text), after.items]).toStrictEqual([
    ["First reply", "Second reply"],
    [],
  ]);

  close();
});

it("posting a reply shows it in the thread", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const parent = await threadIn("web-thread-reply");
  const close = openAt({ client: adminClient(), hash: hashOf(parent) });
  await shownReplies();

  sendReply("My reply");
  await within(screen.getByRole("list", { name: "Replies" })).findByText("My reply");

  const { replies } = await adminClient().getThread(parent.id);

  expect([
    await shownReplies(),
    replies.map((reply) => reply.text),
    screen.queryByDisplayValue("My reply"),
  ]).toStrictEqual([
    ["adminFirst reply", "Second reply", "My reply"],
    ["First reply", "Second reply", "My reply"],
    null,
  ]);

  close();
});

it("a thread with no replies says so", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-thread-empty" });
  const parent = await post("web-thread-empty", "Alone");
  const close = openAt({ client: adminClient(), hash: hashOf(parent) });

  const empty = await screen.findByText("No replies yet.");

  expect([empty.textContent, alertsShown()]).toStrictEqual(["No replies yet.", []]);

  close();
});

it("a thread that doesn't exist shows the server's refusal", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/channels/general/threads/999999" });

  const alert = await inThread().findByRole("alert");

  expect(alert.textContent).toMatch(/^Couldn't load the thread \(message_not_found\)/u);

  close();
});

it("a refused ack says the thread couldn't be marked read", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const parent = await threadIn("web-thread-ack-refused");
  const agent = await newIdentity({ kind: "agent", name: "web-thread-left" });
  const client = await ackingWithALeftSession(agent.token, "web-thread-left");
  const close = openAt({ client, hash: hashOf(parent) });

  const alert = await inThread().findByRole("alert");

  expect(alert.textContent).toMatch(/^Couldn't mark the thread read \(agent_session_revoked\)/u);

  close();
});

it("a refused reply says so and keeps the thread shown, and its text in the box", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const parent = await threadIn("web-thread-reply-refused");
  const writer = await revocableView({
    methods: ["createMessage"],
    revoked: "web-thread-rotated",
    viewer: "web-thread-reply-viewer",
  });
  const close = openAt({ client: writer.client, hash: hashOf(parent) });
  await shownReplies();
  await writer.rotateToken();

  sendReply("Too late");
  const alert = await inThread().findByRole("alert");

  expect([alert.textContent, await shownReplies(), screen.queryByDisplayValue("Too late")]).toStrictEqual([
    expect.stringMatching(/^Couldn't post the reply \(token_revoked\)/u),
    ["adminFirst reply", "Second reply"],
    screen.getByRole("textbox", { name: "Reply" }),
  ]);

  close();
});

async function inboxEmptied(client: CookoutClient): Promise<InboxResponse | false> {
  const inbox = await vi.waitUntil(async () => {
    const answer = await inboxOnceEmpty(client);
    return answer;
  });
  return inbox;
}

async function alerted(): Promise<void> {
  await inThread().findByRole("alert");
}

async function leaveForTheList(): Promise<void> {
  globalThis.location.hash = "#/";
  await screen.findByRole("list", { name: "Channels" });
}

async function openedThenLeft(
  client: CookoutClient,
  parent: Message,
  settled: () => Promise<unknown> = shownReplies,
): Promise<() => void> {
  const close = openAt({ client, hash: hashOf(parent) });
  await settled();
  await leaveForTheList();
  return close;
}

function failingOnce(client: CookoutClient): CookoutClient {
  const unreachable = createCookoutClient({ env: {}, token: "cookout_unused", url: "http://127.0.0.1:9" });
  const sources = [unreachable];
  return {
    ...client,
    getThread: async (id) => {
      const thread = await (sources.pop() ?? client).getThread(id);
      return thread;
    },
  };
}

it("reopening a thread shows the replies posted while it was closed", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const parent = await threadIn("web-thread-reopen");
  const close = await openedThenLeft(adminClient(), parent);
  await replyTo(parent, "Third reply");

  globalThis.location.hash = hashOf(parent);
  await screen.findByText("Third reply");

  await expect(shownReplies()).resolves.toStrictEqual(["adminFirst reply", "Second reply", "Third reply"]);

  close();
});

async function refusedOnReopen(parent: Message, refused: Promise<unknown>): Promise<HTMLElement> {
  globalThis.location.hash = hashOf(parent);
  await refused;
  const alert = await inThread().findByRole("alert");
  return alert;
}

it("reopening a thread that can no longer be read says so and keeps its replies shown", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await threadIn("web-thread-reopen-refused");
  const reader = await revocableView({
    methods: ["ack"],
    revoked: "web-thread-reopen-rotated",
    viewer: "web-thread-reopen-viewer",
  });
  const { client, refused } = refusalNoticed(reader.client);
  const close = await openedThenLeft(client, parent);
  await reader.rotateToken();

  const alert = await refusedOnReopen(parent, refused);

  expect([alert.textContent, await shownReplies()]).toStrictEqual([
    expect.stringMatching(/^Couldn't mark the thread read \(token_revoked\)/u),
    ["adminFirst reply", "Second reply"],
  ]);

  close();
});

it("reopening a thread that failed to load loads it again and acks it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const reader = await newIdentity({ kind: "human", name: "web-thread-reopen-failed-reader" });
  const parent = await followedThreadIn("web-thread-reopen-failed", reader.client);
  const close = await openedThenLeft(failingOnce(reader.client), parent, alerted);

  globalThis.location.hash = hashOf(parent);

  await expect(Promise.all([shownReplies(), inboxEmptied(reader.client)])).resolves.toStrictEqual([
    ["adminFirst reply", "Second reply"],
    expect.objectContaining({ items: [] }),
  ]);

  close();
});
