import type { CookoutClient, ScheduledMessage } from "../../sdk/index.ts";
import { createBoardStore, deletedSchedules, scheduleListOf } from "../index.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import type { BoardStore } from "../index.ts";
import type { HandLive } from "../../testing/web.ts";
import { createCookoutClient } from "../../sdk/index.ts";
import { createLive } from "../../live/index.ts";
import { handLive } from "../../testing/web.ts";
import { isChannelName } from "../../channels/index.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

interface Opened {
  readonly store: BoardStore;
  readonly hand: HandLive;
  readonly reads: () => number;
}

function adminClient(): CookoutClient {
  return createCookoutClient({ env: {}, token: webTestCookout().adminToken, url: webTestCookout().url });
}

function opened(): Opened {
  const client = adminClient();
  const listScheduledMessages = vi.fn<CookoutClient["listScheduledMessages"]>(client.listScheduledMessages);
  const hand = handLive();
  const store = createBoardStore({
    client: { ...client, listScheduledMessages },
    live: createLive(hand.adapter),
    url: webTestCookout().url,
  });
  onTestFinished(store.subscribeShowing("channels")(vi.fn<() => void>()));
  return { hand, reads: () => listScheduledMessages.mock.calls.length, store };
}

function shown(store: BoardStore): void {
  onTestFinished(store.subscribeShowing("schedules")(vi.fn<() => void>()));
}

async function scheduledIn(channel: string, text = "standup"): Promise<ScheduledMessage> {
  await adminClient()
    .createChannel({ name: channel })
    .catch(() => null);
  const { scheduledMessage } = await adminClient().createScheduledMessage({
    channel,
    cron: "0 9 * * *",
    text,
    timeZone: "UTC",
  });
  return scheduledMessage;
}

const NONE = 0;
const ONCE = 1;
const TWICE = 2;

function textsIn(store: BoardStore, channel: string): readonly string[] | null {
  if (!isChannelName(channel)) {
    return null;
  }
  const listed = scheduleListOf(channel)(store.snapshot());
  if (listed.status !== "loaded") {
    return null;
  }
  return listed.schedules.map((schedule) => schedule.text);
}

async function listing(store: BoardStore, channel: string, texts: readonly string[]): Promise<void> {
  await vi.waitFor(() => {
    expect(textsIn(store, channel)).toStrictEqual(texts);
  });
}

async function shownIn(store: BoardStore, channel: string, texts: readonly string[]): Promise<void> {
  shown(store);
  await listing(store, channel, texts);
}

async function shownListing(channel: string, texts: readonly string[]): Promise<Opened> {
  const open = opened();
  await shownIn(open.store, channel, texts);
  return open;
}

function sent(hand: HandLive, scheduledMessage: ScheduledMessage, deleted = false): void {
  hand.send({ deleted, scheduledMessage, type: "scheduled-message" });
}

it("the schedules are read only once a view first shows them, once however many show them", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await scheduledIn("store-schedules-read");
  const { reads, store } = opened();
  const before = [reads(), textsIn(store, "store-schedules-read")];
  shown(store);
  shown(store);
  await listing(store, "store-schedules-read", ["standup"]);

  expect([...before, reads()]).toStrictEqual([NONE, null, ONCE]);
});

it("a scheduled-message event changes its schedule by ID, and the same event again keeps the selector's object", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const schedule = await scheduledIn("store-schedules-applied");
  const { hand, store } = await shownListing("store-schedules-applied", ["standup"]);
  const edited = { ...schedule, text: "standup, now" };
  sent(hand, edited);
  const after = store.snapshot().schedules;
  sent(hand, edited);

  expect(textsIn(store, "store-schedules-applied")).toStrictEqual(["standup, now"]);
  expect(store.snapshot().schedules).toBe(after);
});

async function keptThenGone(channel: string): Promise<ScheduledMessage> {
  await scheduledIn(channel, "kept");
  const gone = await scheduledIn(channel, "gone");
  return gone;
}

it("a deleted schedule leaves the list and its ID is kept as deleted, though the list was never shown", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const early = await scheduledIn("store-schedules-deleted", "early");
  await adminClient().deleteScheduledMessage(early.id);
  const gone = await keptThenGone("store-schedules-deleted");
  const { hand, store } = opened();
  sent(hand, early, true);
  await shownIn(store, "store-schedules-deleted", ["kept", "gone"]);
  sent(hand, gone, true);

  expect(textsIn(store, "store-schedules-deleted")).toStrictEqual(["kept"]);
  expect([...deletedSchedules(store.snapshot())]).toStrictEqual([early.id, gone.id]);
});

it("the schedules are read again when the link comes back while shown", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await scheduledIn("store-schedules-back", "first");
  const { hand, reads, store } = await shownListing("store-schedules-back", ["first"]);
  await scheduledIn("store-schedules-back", "missed");
  hand.report("down");
  hand.report("up");
  await listing(store, "store-schedules-back", ["first", "missed"]);

  expect(reads()).toBe(TWICE);
});

it("a deleted schedule the list doesn't hold leaves the list as it was, but its ID is kept as deleted", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const gone = await scheduledIn("store-schedules-unheld", "gone");
  await adminClient().deleteScheduledMessage(gone.id);
  await scheduledIn("store-schedules-unheld", "kept");
  const { hand, store } = await shownListing("store-schedules-unheld", ["kept"]);
  const before = store.snapshot().schedules.listed;
  sent(hand, gone, true);

  expect(store.snapshot().schedules.listed).toBe(before);
  expect(deletedSchedules(store.snapshot()).has(gone.id)).toBe(true);
});

it("a refused read of the schedules shows the refusal", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const client = adminClient();
  const store = createBoardStore({
    client: {
      ...client,
      listScheduledMessages: async () => {
        const refused = await client.listScheduledMessages({ channel: "no-such-channel" });
        return refused;
      },
    },
    live: createLive(handLive().adapter),
    url: webTestCookout().url,
  });
  onTestFinished(store.subscribeShowing("channels")(vi.fn<() => void>()));
  shown(store);
  await vi.waitFor(() => {
    expect(store.snapshot().schedules.listed.status).toBe("failed");
  });

  expect(store.snapshot().schedules.listed).toMatchObject({ code: "channel_not_found", status: "failed" });
});
