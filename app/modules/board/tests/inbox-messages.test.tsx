import type { BoardState, BoardStore } from "../index.ts";
import type { InboxItem, Message, ReactionCount, TopLevelMessage } from "../../sdk/index.ts";
import { adminClient, humanIn, shown } from "./held-store.ts";
import { createBoardStore, inboxOf, reactionsOf } from "../index.ts";
import { expect, it, vi } from "vitest";
import type { HandLive } from "../../testing/web.ts";
import { createLive } from "../../live/index.ts";
import { handLive } from "../../testing/web.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

interface Watching {
  readonly store: BoardStore;
  readonly hand: HandLive;
  readonly parent: TopLevelMessage;
}

function topLevel(message: Message): TopLevelMessage {
  if (message.kind !== "top-level") {
    throw new Error("A message posted without replyTo is top-level.");
  }
  return message;
}

function itemsOf(state: BoardState): readonly InboxItem[] {
  const inbox = inboxOf(state);
  if (inbox.status !== "loaded") {
    throw new Error(`The inbox is ${inbox.status}.`);
  }
  return inbox.items;
}

async function watchingOne(name: string): Promise<Watching> {
  await adminClient().createChannel({ name });
  const { client } = await humanIn(name);
  await client.subscribe(name);
  const { message } = await adminClient().createMessage({ channel: name, text: "Ship it?" });
  const hand = handLive();
  const store = createBoardStore({ client, live: createLive(hand.adapter), url: webTestCookout().url });
  shown(store.subscribeShowing("inbox")(vi.fn<() => void>()));
  shown(store.subscribeShowing("reactions")(vi.fn<() => void>()));
  await vi.waitFor(() => {
    itemsOf(store.snapshot());
  });
  return { hand, parent: topLevel(message), store };
}

interface Seen {
  readonly closed: readonly string[];
  readonly reactions: readonly (readonly ReactionCount[])[];
  readonly fromTable: readonly boolean[];
}

function seenIn(state: BoardState): Seen {
  const items = itemsOf(state);
  return {
    closed: items.map((item) => typeof item.parent.closedAt),
    fromTable: items.map((item) => item.message === state.messages.table.get(item.message.id)),
    reactions: items.map((item) => reactionsOf({ message: item.message, state })),
  };
}

it("an Inbox item's messages are the messages table's, so thread and reaction events reach it there", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const { hand, parent, store } = await watchingOne("web-inbox-messages-table");
  const { message: closed } = await adminClient().closeThread(parent.id);
  hand.send({ parent: topLevel(closed), type: "thread" });
  const thumbsUp = { by: [parent.author.name], count: 1, reaction: "thumbs_up" } as const;
  hand.send({ channel: parent.channel, messageId: parent.id, reactions: [thumbsUp], type: "reaction" });

  expect(seenIn(store.snapshot())).toStrictEqual({ closed: ["string"], fromTable: [true], reactions: [[thumbsUp]] });
});
