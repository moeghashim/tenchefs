import type { ChannelName, IdentityName, Message } from "../../sdk/index.ts";
import type { ExternalStore, HandLive, Publishes } from "../../testing/web.ts";
import type { Selection, Unread } from "../../unread/index.ts";
import { adminClient, humanIn, opened } from "./held-store.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import { createUnread } from "../../unread/index.ts";
import { recordPublishes } from "../../testing/web.ts";
import { waitFor } from "@testing-library/react";

const NAME = "web-unread-publishes";
const NONE = 0;

interface Following {
  readonly unread: Unread;
  readonly hand: HandLive;
  readonly reader: IdentityName;
}

function followed<State>(store: ExternalStore<State>): void {
  onTestFinished(store.subscribe(vi.fn<() => void>()));
}

async function followingTheInbox(name: string): Promise<Following> {
  const reader = await humanIn(`${NAME}-${name}`);
  const { hand, store: boardStore } = opened({ client: reader.client });
  const unread = createUnread({ boardStore });
  followed(unread);
  followed({ snapshot: boardStore.snapshot, subscribe: boardStore.subscribeShowing("presence") });
  await waitFor(() => {
    expect(unread.snapshot().status).toBe("loaded");
  });
  return { hand, reader: reader.name, unread };
}

interface Posted {
  readonly channel: ChannelName;
  readonly message: Message;
}

async function posted(name: string): Promise<Posted> {
  const { channel } = await adminClient().createChannel({ name: `${NAME}-${name}` });
  const { message } = await adminClient().createMessage({ channel: channel.name, text: "Lunch?" });
  return { channel: channel.name, message };
}

function everyStoreOf(unread: Unread, channel: ChannelName): readonly Publishes[] {
  return [
    recordPublishes(unread.selection({ channel, thread: null })),
    recordPublishes(unread.newLine(channel, null)),
    recordPublishes(unread),
    recordPublishes(unread.earlier),
    recordPublishes(unread.alerts),
    recordPublishes(unread.nudges),
    recordPublishes(unread.deactivationOffers),
    recordPublishes(unread.deactivatedQuietAgents),
    recordPublishes(unread.agentJoinRequests),
    recordPublishes({ snapshot: unread.markChannel.refusal, subscribe: unread.markChannel.subscribe }),
    recordPublishes({ snapshot: unread.menu.refusal, subscribe: unread.menu.subscribe }),
  ];
}

it("someone coming online publishes nothing from the unread store or any store of its own", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { channel } = await posted("online");
  const { hand, reader, unread } = await followingTheInbox("online");
  const publishes = everyStoreOf(unread, channel);

  hand.send({ presence: { identity: reader, online: true }, type: "presence" });

  expect(publishes.map((store) => store.count())).toStrictEqual(publishes.map(() => NONE));
});

it("a reply in somebody else's thread publishes nothing from the unread store or any store of its own", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { channel, message } = await posted("reply");
  const { message: reply } = await adminClient().createMessage({ channel, replyTo: message.id, text: "Yes" });
  const { hand, unread } = await followingTheInbox("reply");
  const publishes = everyStoreOf(unread, channel);

  hand.send({ message: reply, type: "message" });

  expect(publishes.map((store) => store.count())).toStrictEqual(publishes.map(() => NONE));
});

interface Selected {
  readonly message: Message;
  readonly selection: Selection;
}

async function expandedWithAReplyPost(): Promise<Selected> {
  const { channel, message } = await posted("again");
  const { unread } = await followingTheInbox("again");
  const selection = unread.selection({ channel, thread: null });
  followed(selection);
  selection.expand();
  selection.chooseReplyPost(message);
  return { message, selection };
}

it("expanding a selection again, or choosing the same reply post again, publishes nothing", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { message, selection } = await expandedWithAReplyPost();
  const publishes = recordPublishes(selection);

  selection.expand();
  selection.chooseReplyPost({ ...message });

  expect(publishes.count()).toBe(NONE);
});
