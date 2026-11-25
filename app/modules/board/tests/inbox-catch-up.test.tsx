import type { BoardStore, OffersShown } from "../index.ts";
import type { CookoutClient, CookoutEvent, Identity, Message } from "../../sdk/index.ts";
import { adminClient, bounce, humanIn, shown } from "./held-store.ts";
import { alertsOf, createBoardStore, earlierOf, inboxOf, offersOf } from "../index.ts";
import { expect, it, vi } from "vitest";
import type { HandLive } from "../../testing/web.ts";
import { createLive } from "../../live/index.ts";
import { handLive } from "../../testing/web.ts";
import { parseEvent } from "../../sdk/index.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

const ONE_PER_PAGE = 1;

interface Watching {
  readonly store: BoardStore;
  readonly hand: HandLive;
}

interface Watched {
  readonly client: CookoutClient;
  readonly pageSize?: number;
}

function watched({ client, pageSize }: Watched): Watching {
  const hand = handLive();
  const live = createLive(hand.adapter);
  const { url } = webTestCookout();
  const store = createBoardStore({ client, live, url, ...(typeof pageSize === "number" && { pageSize }) });
  shown(store.subscribeShowing("inbox")(vi.fn<() => void>()));
  return { hand, store };
}

async function loaded(asked: Watched): Promise<Watching> {
  const watching = watched(asked);
  await vi.waitFor(() => {
    const state = watching.store.snapshot();

    expect([inboxOf(state).status, earlierOf(state).status]).toStrictEqual(["loaded", "loaded"]);
  });
  return watching;
}

async function readerIn(names: readonly string[]): Promise<CookoutClient> {
  const [first = "", ...rest] = names;
  await Promise.all(
    names.map(async (name) => {
      await adminClient().createChannel({ name });
    }),
  );
  const { client } = await humanIn(first);
  await Promise.all(
    [first, ...rest].map(async (name) => {
      await client.subscribe(name);
    }),
  );
  return client;
}

async function posted(channel: string): Promise<Message> {
  const { message } = await adminClient().createMessage({ channel, text: "Ship it?" });
  return message;
}

function earlierIds(store: BoardStore): readonly number[] {
  const earlier = earlierOf(store.snapshot());
  if (earlier.status !== "loaded") {
    throw new Error(`Earlier is ${earlier.status}.`);
  }
  return earlier.items.map((item) => item.message.id);
}

function eventOf(type: string, data: object): CookoutEvent {
  const event = parseEvent({ data: JSON.stringify({ ...data, type }), event: type });
  if (event === null) {
    throw new Error(`A ${type} event parses.`);
  }
  return event;
}

function offerOn(identity: Identity): CookoutEvent {
  const deactivationOffer = {
    cleared: false,
    id: 1,
    identity,
    quietDays: 30,
    raisedAt: "2026-11-24T00:00:00.000Z",
    text: "Quiet for 30 days",
  };
  return eventOf("deactivation-offer", { deactivationOffer });
}

function quietAgentOn(identity: Identity): CookoutEvent {
  const deactivatedQuietAgent = {
    deactivatedAt: "2026-11-24T00:00:00.000Z",
    id: 1,
    identity,
    read: false,
    text: "Gone",
  };
  return eventOf("deactivated-quiet-agent", { deactivatedQuietAgent });
}

async function agent(name: string): Promise<Identity> {
  const { identity } = await adminClient().createIdentity({ kind: "human", name });
  return identity;
}

interface Noticed {
  readonly offers: number;
  readonly quiet: number;
}

function noticedIn(store: BoardStore): Noticed {
  const inbox = inboxOf(store.snapshot());
  if (inbox.status !== "loaded") {
    throw new Error(`The inbox is ${inbox.status}.`);
  }
  return { offers: inbox.deactivationOffers.length, quiet: inbox.deactivatedQuietAgents.length };
}

function clearedOffers(offers: OffersShown): readonly boolean[] {
  if (offers.status !== "loaded") {
    throw new Error(`The offers are ${offers.status}.`);
  }
  return offers.deactivationOffers.map(({ cleared }) => cleared);
}

interface ReadBetweenUnread {
  readonly reader: CookoutClient;
  readonly first: Message;
  readonly third: Message;
}

async function readBetweenUnread(): Promise<ReadBetweenUnread> {
  const reader = await readerIn(["web-inbox-paging-a", "web-inbox-paging-b"]);
  const first = await posted("web-inbox-paging-a");
  await posted("web-inbox-paging-b");
  const third = await posted("web-inbox-paging-a");
  await posted("web-inbox-paging-b");
  await reader.ack(third.id);
  return { first, reader, third };
}

it("the Earlier list reads on past a page of only unread items, on load and on loading more", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const { first, reader, third } = await readBetweenUnread();
  const { store } = await loaded({ client: reader, pageSize: ONE_PER_PAGE });
  const before = earlierIds(store);
  store.inboxCalls.loadEarlier();
  await vi.waitFor(() => {
    expect({ after: earlierIds(store), before }).toStrictEqual({ after: [third.id, first.id], before: [third.id] });
  });
});

it("a reader with nothing has an empty Inbox, Earlier and alerts", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const { store } = await loaded({ client: await readerIn(["web-inbox-empty"]) });

  expect({ alerts: alertsOf(store.snapshot()), earlier: earlierIds(store) }).toStrictEqual({
    alerts: { alerts: [], status: "loaded" },
    earlier: [],
  });
});

interface NoticedWatching extends Watching {
  readonly identity: Identity;
}

async function noticed(channel: string): Promise<NoticedWatching> {
  const reader = await readerIn([channel]);
  const identity = await agent(`${channel}-scout`);
  const watching = await loaded({ client: reader });
  watching.hand.send(offerOn(identity));
  watching.hand.send(quietAgentOn(identity));
  return { ...watching, identity };
}

it("the link coming back clears an Offer and reads a quiet agent the server no longer lists", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const { hand, store } = await noticed("web-inbox-notices-back");
  const before = noticedIn(store);
  bounce(hand);
  await vi.waitFor(() => {
    expect({ after: noticedIn(store), before }).toStrictEqual({
      after: { offers: 0, quiet: 0 },
      before: { offers: 1, quiet: 1 },
    });
  });

  const offers = offersOf(store.snapshot());

  expect(clearedOffers(offers)).toStrictEqual([true]);
});

it("a deleted identity takes its Offers out", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const { hand, identity, store } = await noticed("web-inbox-offer-deleted");
  hand.send({ identity, type: "identity-deleted" });
  const offers = offersOf(store.snapshot());

  expect(clearedOffers(offers)).toStrictEqual([]);
});

interface Failing {
  readonly client: CookoutClient;
  readonly fails: (call: number) => boolean;
}

function failingReads({ client, fails }: Failing): CookoutClient {
  let calls = 0;
  function check(): void {
    calls += ONE_PER_PAGE;
    if (fails(calls)) {
      throw new Error("The server is down.");
    }
  }
  return {
    ...client,
    inboxHistory: async (query) => {
      check();
      const answer = await client.inboxHistory(query);
      return answer;
    },
    readPositions: async () => {
      check();
      const answer = await client.readPositions();
      return answer;
    },
  };
}

const TWO_READS = 2;

interface Switched {
  readonly client: CookoutClient;
  readonly failBack: (hand: HandLive) => void;
  readonly refused: () => number;
}

function switchedOff(reader: CookoutClient): Switched {
  let failing = false;
  let refused = 0;
  function fails(): boolean {
    refused += Number(failing);
    return failing;
  }
  return {
    client: failingReads({ client: reader, fails }),
    failBack: (hand) => {
      failing = true;
      bounce(hand);
    },
    refused: () => refused,
  };
}

it("a first read the server refuses fails, and a later one keeps what the Inbox showed", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const reader = await readerIn(["web-inbox-refused-read"]);
  const refused = watched({ client: failingReads({ client: reader, fails: () => true }) });
  const loading = alertsOf(refused.store.snapshot());
  const switched = switchedOff(reader);
  const { hand, store } = await loaded({ client: switched.client });
  switched.failBack(hand);
  await vi.waitFor(() => {
    expect({ refused: alertsOf(refused.store.snapshot()), refusedAgain: switched.refused() }).toStrictEqual({
      refused: { status: "failed" },
      refusedAgain: TWO_READS,
    });
  });
  const after = [inboxOf(store.snapshot()).status, earlierOf(store.snapshot()).status];

  expect({ after, loading }).toStrictEqual({ after: ["loaded", "loaded"], loading: { status: "loading" } });
});

it("a later page the server refuses fails Earlier", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const reader = await readerIn(["web-inbox-refused-page"]);
  const read = await posted("web-inbox-refused-page");
  await reader.ack(read.id);
  await posted("web-inbox-refused-page");
  const secondPage = 3;
  const client = failingReads({ client: reader, fails: (call) => call === secondPage });
  const { store } = watched({ client, pageSize: ONE_PER_PAGE });
  await vi.waitFor(() => {
    expect(earlierOf(store.snapshot()).status).toBe("failed");
  });
});
