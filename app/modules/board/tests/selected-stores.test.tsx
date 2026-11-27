import type { ExternalStore, Publishes } from "../../testing/web.ts";
import { bothShown, postedIn, repliedTo } from "./held-store.ts";
import {
  channelList,
  channelPage,
  closingRefusal,
  deletedSchedules,
  messageBeforeOf,
  scheduleListOf,
  selectedStore,
  subscribedChannels,
  threadOf,
  webhookCommandList,
} from "../index.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import type { BoardStore } from "../index.ts";
import type { TopLevelMessage } from "../../sdk/index.ts";
import { recordPublishes } from "../../testing/web.ts";

const CHANNEL = "web-selected-stores";
const NONE = 0;

function storesOf(store: BoardStore, parent: TopLevelMessage): readonly ExternalStore<unknown>[] {
  const place = { channel: parent.channel, id: parent.id };
  const read = store.snapshot;
  const page = channelPage(parent.channel);
  const thread = threadOf(place);
  const before = messageBeforeOf(place);
  const schedules = scheduleListOf(parent.channel);
  return [
    selectedStore({ snapshot: () => channelList(read()), subscribe: store.subscribeShowing("channels") }),
    selectedStore({ snapshot: () => page(read()), subscribe: store.channelPages.subscribeShowing(parent.channel) }),
    selectedStore({ snapshot: () => thread(read()), subscribe: store.threads.subscribeShowing(place, true) }),
    selectedStore({ snapshot: () => before(read()), subscribe: store.subscribeShowingBefore(place) }),
    selectedStore({ snapshot: () => webhookCommandList(read()), subscribe: store.subscribeShowing("webhookCommands") }),
    selectedStore({ snapshot: () => subscribedChannels(read()), subscribe: store.subscribeShowing("subscriptions") }),
    selectedStore({ snapshot: () => schedules(read()), subscribe: store.subscribeShowing("schedules") }),
    selectedStore({ snapshot: () => deletedSchedules(read()), subscribe: store.subscribe }),
    selectedStore({ snapshot: () => closingRefusal(read()), subscribe: store.subscribe }),
  ];
}

function statusOf(snapshot: unknown): unknown {
  if (typeof snapshot !== "object" || snapshot === null) {
    return null;
  }
  return Reflect.get(snapshot, "status");
}

async function recordedOnceLoaded(stores: readonly ExternalStore<unknown>[]): Promise<readonly Publishes[]> {
  for (const each of stores) {
    onTestFinished(each.subscribe(vi.fn<() => void>()));
  }
  await vi.waitFor(() => {
    expect(stores.map((each) => statusOf(each.snapshot()))).not.toContain("loading");
  });
  return stores.map((each) => recordPublishes(each));
}

it("a store selecting one part of the board publishes nothing when another part changes", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await postedIn(CHANNEL);
  await repliedTo({ parent });
  const { hand, store } = await bothShown({ parent });
  const publishes = await recordedOnceLoaded(storesOf(store, parent));

  hand.send({ presence: { identity: parent.author.name, online: true }, type: "presence" });
  hand.send({ presence: { identity: parent.author.name, online: false }, type: "presence" });

  expect(publishes.map((each) => each.count())).toStrictEqual(publishes.map(() => NONE));
});
