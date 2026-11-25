import type { Board, Seen } from "./board-seen.ts";
import type { CookoutClient, CookoutEvent, InboxItem } from "../../sdk/index.ts";
import { adminClient, postedIn, repliedTo, shown } from "./held-store.ts";
import { boardIn, forYouIn, itemsIn, loaded } from "./board-seen.ts";
import { createBoardStore, earlierOf, inboxOf } from "../index.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import type { BoardStore } from "../index.ts";
import type { HandLive } from "../../testing/web.ts";
import { createCookoutClient } from "../../sdk/index.ts";
import { createLive } from "../../live/index.ts";
import { createTestAgent } from "../../testing/index.ts";
import { handLive } from "../../testing/web.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

interface Watching {
  readonly store: BoardStore;
  readonly hand: HandLive;
}

const TWO = 2;

const SHOWN = [
  "channels",
  "commands",
  "identities",
  "inbox",
  "presence",
  "reactions",
  "session",
  "subscriptions",
  "triggers",
] as const;

function clientOf(token: string): CookoutClient {
  return createCookoutClient({ env: {}, token, url: webTestCookout().url });
}

async function boardFor(name: string): Promise<Board> {
  const parent = await postedIn(name);
  const { identity, token } = await adminClient().createIdentity({ kind: "human", name: `${name}-bob` });
  const reader = clientOf(token);
  await reader.subscribe(name);
  const { message } = await reader.createMessage({ channel: name, replyTo: parent.id, text: "Mine." });
  const agent = await createTestAgent({ by: adminClient(), name: `${name}-bot`, owner: identity.name });
  return {
    agent: clientOf(agent.token),
    agentName: agent.identity.name,
    channel: parent.channel,
    own: message,
    parent,
    reader,
    readerName: identity.name,
  };
}

function watching(board: Board): Watching {
  const hand = handLive();
  const store = createBoardStore({ client: board.reader, live: createLive(hand.adapter), url: webTestCookout().url });
  for (const slice of SHOWN) {
    shown(store.subscribeShowing(slice)(vi.fn<() => void>()));
  }
  shown(store.channelPages.subscribeShowing(board.channel)(vi.fn<() => void>()));
  shown(store.threads.subscribeShowing({ channel: board.channel, id: board.parent.id }, true)(vi.fn<() => void>()));
  shown(store.subscribeShowingSessions(board.agentName)(vi.fn<() => void>()));
  return { hand, store };
}

async function loadedIn({ store }: Watching, board: Board): Promise<Seen> {
  await vi.waitFor(() => {
    const seen = boardIn({ board, state: store.snapshot() });

    expect(loaded(seen)).toBe(true);
  });
  return boardIn({ board, state: store.snapshot() });
}

async function triggerFor(board: Board): Promise<CookoutEvent> {
  const { trigger } = await board.reader.setTrigger(board.agentName, {
    token: "routine-token",
    url: "https://routine.example/fire",
  });
  if (trigger === null) {
    throw new Error("A trigger URL just set is answered.");
  }
  return { identity: board.agentName, trigger, type: "trigger" };
}

async function agentInTheGap(board: Board): Promise<void> {
  await board.agent.join({ as: board.agentName, host: "catch-up-box" });
  const events = await board.agent.watch();
  onTestFinished(events.close);
}

async function changedInTheGap(board: Board): Promise<void> {
  const admin = adminClient();
  const added = `${board.channel}-new`;
  await admin.createChannel({ name: added });
  await board.reader.subscribe(added);
  await admin.addCommand({ name: `${board.channel}-deploy`, schema: { type: "object" }, url: "http://127.0.0.1:9/" });
  await admin.setDisplayName(board.readerName, "Bob Renamed");
  await agentInTheGap(board);
  await repliedTo({ parent: board.parent });
  await admin.createMessage({ channel: board.channel, text: "Posted in the gap." });
  await admin.react(board.own.id, "thumbs_up");
}

async function freshlyLoaded(board: Board): Promise<Seen> {
  const fresh = watching(board);
  await vi.waitFor(() => {
    const { session } = fresh.store.snapshot();

    expect(session).toMatchObject({ identity: { displayName: "Bob Renamed" } });
  });
  const seen = await loadedIn(fresh, board);
  return seen;
}

it("a whole-board catch-up after the link goes down and up leaves every slice's selectors as a fresh load would", {
  timeout: 20_000,
}, async () => {
  expect.hasAssertions();

  const board = await boardFor("store-catch-up-all");
  const caught = watching(board);
  caught.hand.send(await triggerFor(board));
  await loadedIn(caught, board);
  caught.hand.report("down");
  await changedInTheGap(board);
  caught.hand.report("up");
  const fresh = await freshlyLoaded(board);

  await vi.waitFor(() => {
    const seen = boardIn({ board, state: caught.store.snapshot() });

    expect(seen).toStrictEqual(fresh);
  });
});

async function replayedAfterAGap(board: Board, { hand, store }: Watching): Promise<readonly InboxItem[]> {
  hand.report("down");
  await repliedTo({ parent: board.parent });
  await adminClient().react(board.own.id, "thumbs_up");
  hand.report("up");
  const { items } = await board.reader.inbox();
  const replayed = items.filter((item) => item.message.channel === board.channel);
  const expected = itemsIn({ channel: board.channel, items: replayed });
  await vi.waitFor(() => {
    const forYou = forYouIn({ channel: board.channel, state: store.snapshot() });

    expect(forYou).toStrictEqual(expected);
  });
  return replayed;
}

it("an inbox item the server replays after a resume, already held, changes nothing", {
  timeout: 20_000,
}, async () => {
  expect.hasAssertions();

  const board = await boardFor("store-catch-up-replay");
  const caught = watching(board);
  await loadedIn(caught, board);
  const replayed = await replayedAfterAGap(board, caught);
  const held = caught.store.snapshot();
  for (const item of replayed) {
    caught.hand.send({ item, type: "inbox-item" });
  }
  const after = caught.store.snapshot();

  expect([replayed.length, inboxOf(after) === inboxOf(held), earlierOf(after) === earlierOf(held)]).toStrictEqual([
    TWO,
    true,
    true,
  ]);
});

it("the board store is the live stream's one follower, and a second follower is refused", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const hand = handLive();
  const live = createLive(hand.adapter);
  const store = createBoardStore({ client: adminClient(), live, url: webTestCookout().url });
  shown(store.subscribeShowing("triggers")(vi.fn<() => void>()));

  expect(() => {
    live.follow({ back: vi.fn<() => void>(), heard: vi.fn<() => void>() });
  }).toThrow("The live stream already has its follower, the board store.");
});
