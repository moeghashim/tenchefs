import type { Message, ServerSentEvent } from "../../sdk/index.ts";
import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import type { Unread } from "../../unread/index.ts";
import { boardStoreFor } from "./defaults.ts";
import { createUnread } from "../../unread/index.ts";
import { scriptedLive } from "../../testing/web.ts";
import { waitFor } from "@testing-library/react";

const CHANNEL = "web-unread-unrelated-reply";

interface Following {
  readonly unread: Unread;
  readonly reply: Message;
  readonly send: (event: ServerSentEvent) => void;
  readonly changes: () => number;
}

async function replyElsewhere(): Promise<Message> {
  await adminClient().createChannel({ name: CHANNEL });
  const { message: parent } = await adminClient().createMessage({ channel: CHANNEL, text: "Somebody else's thread" });
  const { message: reply } = await adminClient().createMessage({
    channel: CHANNEL,
    replyTo: parent.id,
    text: "A reply",
  });
  return reply;
}

async function followingAReply(): Promise<Following> {
  const reader = await newIdentity({ kind: "human", name: `${CHANNEL}-reader` });
  const reply = await replyElsewhere();
  const { live, send } = scriptedLive();
  const unread = createUnread({ boardStore: boardStoreFor({ client: reader.client, live }) });
  const heard: null[] = [];
  unread.subscribe(() => {
    heard.push(null);
  });
  await waitFor(() => {
    expect(unread.snapshot().status).toBe("loaded");
  });
  return { changes: () => heard.length, reply, send, unread };
}

it("a reply in a thread that touches nothing in the inbox keeps the same unread snapshot", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { changes, reply, send, unread } = await followingAReply();
  const before = { changes: changes(), snapshot: unread.snapshot() };

  send({ data: JSON.stringify({ message: reply, type: "message" }), event: "message" });

  expect({ changes: changes(), same: unread.snapshot() === before.snapshot }).toStrictEqual({
    changes: before.changes,
    same: true,
  });
});
