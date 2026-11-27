import type { CookoutClient, CookoutEvent, EventStream } from "../../sdk/index.ts";
import { adminClient, humanIn, opened, postedIn, repliedTo, shown } from "./held-store.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import type { BoardStore } from "../index.ts";
import { recordPublishes } from "../../testing/web.ts";

const CHANNEL = "web-heard-twice";
const NONE = 0;

type Shown = Parameters<BoardStore["subscribeShowing"]>[number];

const SLICES: readonly Shown[] = [
  "channels",
  "webhookCommands",
  "identities",
  "inbox",
  "presence",
  "reactions",
  "schedules",
  "session",
  "subscriptions",
  "triggers",
];

function showEverything(store: BoardStore): void {
  for (const slice of SLICES) {
    shown(store.subscribeShowing(slice)(vi.fn<() => void>()));
  }
}

function collected(stream: EventStream): readonly CookoutEvent[] {
  const events: CookoutEvent[] = [];
  async function read(): Promise<void> {
    for await (const event of stream) {
      events.push(event);
    }
  }
  const reading = read();
  onTestFinished(async () => {
    await stream.close();
    await reading;
  });
  return events;
}

async function activity(reader: CookoutClient): Promise<void> {
  const parent = await postedIn(CHANNEL);
  await reader.subscribe(CHANNEL);
  const reply = await repliedTo({ parent });
  await adminClient().react(reply.id, "thumbs_up");
}

interface Heard {
  readonly events: readonly CookoutEvent[];
  readonly reader: CookoutClient;
}

async function heardOnTheBoard(): Promise<Heard> {
  const bob = await humanIn(CHANNEL);
  const events = collected(await bob.client.watch({ allChannels: true }));
  await activity(bob.client);
  await vi.waitFor(() => {
    expect(events.map((event) => event.type)).toContain("reaction");
  });
  return { events, reader: bob.client };
}

function sendAll(send: (event: CookoutEvent) => void, events: readonly CookoutEvent[]): void {
  for (const event of events) {
    send(event);
  }
}

it("every event heard a second time leaves the board store's snapshot as it was", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { events, reader } = await heardOnTheBoard();
  const { hand, store } = opened({ client: reader });
  showEverything(store);
  await vi.waitFor(() => {
    expect(store.snapshot().channels.status).toBe("loaded");
  });
  sendAll(hand.send, events);
  const publishes = recordPublishes({ snapshot: store.snapshot, subscribe: store.subscribe });

  sendAll(hand.send, events);

  expect(publishes.count()).toBe(NONE);
});
