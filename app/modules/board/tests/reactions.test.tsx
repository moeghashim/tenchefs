import type { CookoutClient, CookoutEvent, IdentityName, Message, ReactionCount } from "../../sdk/index.ts";
import { createBoardStore, reactionRefusal, reactionsOf } from "../index.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import type { BoardStore } from "../index.ts";
import type { HandLive } from "../../testing/web.ts";
import { createCookoutClient } from "../../sdk/index.ts";
import { createLive } from "../../live/index.ts";
import { handLive } from "../../testing/web.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

interface Opened {
  readonly store: BoardStore;
  readonly hand: HandLive;
}

function adminClient(): CookoutClient {
  return createCookoutClient({ env: {}, token: webTestCookout().adminToken, url: webTestCookout().url });
}

interface Human {
  readonly name: IdentityName;
  readonly client: CookoutClient;
}

async function humanNamed(name: string): Promise<Human> {
  const { identity, token } = await adminClient().createIdentity({ kind: "human", name });
  return { client: createCookoutClient({ env: {}, token, url: webTestCookout().url }), name: identity.name };
}

async function adminName(): Promise<IdentityName> {
  const { identity } = await adminClient().whoami();
  return identity.name;
}

async function postedIn(channel: string): Promise<Message> {
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: "Ship it?" });
  return message;
}

function opened(client: CookoutClient = adminClient()): Opened {
  const hand = handLive();
  const store = createBoardStore({ client, live: createLive(hand.adapter), url: webTestCookout().url });
  const unsubscribe = store.subscribeShowing("reactions")(vi.fn<() => void>());
  onTestFinished(unsubscribe);
  return { hand, store };
}

function thumbsUpBy(by: readonly IdentityName[]): ReactionCount {
  return { by, count: by.length, reaction: "thumbs_up" };
}

function held(store: BoardStore, message: Message): readonly ReactionCount[] {
  return reactionsOf({ message, state: store.snapshot() });
}

async function shows(store: BoardStore, message: Message, reactions: readonly ReactionCount[]): Promise<void> {
  await vi.waitFor(() => {
    expect(held(store, message)).toStrictEqual(reactions);
  });
}

function reactionEvent(message: Message, by: readonly IdentityName[]): CookoutEvent {
  return { channel: message.channel, messageId: message.id, reactions: [thumbsUpBy(by)], type: "reaction" };
}

function bounce(hand: HandLive): void {
  hand.report("down");
  hand.report("up");
}

function sendingWhileRead(hand: HandLive, event: CookoutEvent): CookoutClient["getThread"] {
  return async (id) => {
    const answer = await adminClient().getThread(id);
    hand.send(event);
    return answer;
  };
}

function refusedClient(): CookoutClient {
  return createCookoutClient({ env: {}, token: "cookout_not_a_token", url: webTestCookout().url });
}

it("a reaction event changes that message's reactions, and the same event again keeps the selector's object", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const message = await postedIn("store-reactions-event");
  const bob = await humanNamed("store-reactions-event-bob");
  const { hand, store } = opened();
  const before = held(store, message);
  hand.send(reactionEvent(message, [bob.name]));
  const after = held(store, message);
  hand.send(reactionEvent(message, [bob.name]));

  expect([before, after]).toStrictEqual([[], [thumbsUpBy([bob.name])]]);
  expect(held(store, message)).toBe(after);
});

it("toggling leaves the reader's reaction, and toggling again removes it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const message = await postedIn("store-reactions-toggle");
  const me = await adminName();
  const { store } = opened();
  store.toggle({ me, message, reaction: "thumbs_up" });
  await shows(store, message, [thumbsUpBy([me])]);
  store.toggle({ me, message, reaction: "thumbs_up" });

  await shows(store, message, []);
});

it("a refused toggle keeps its refusal through events, until the next toggle", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const message = await postedIn("store-reactions-refused");
  const bob = await humanNamed("store-reactions-refused-bob");
  const { hand, store } = opened({ ...adminClient(), react: refusedClient().react });
  store.toggle({ me: bob.name, message, reaction: "thumbs_up" });
  await vi.waitFor(() => {
    expect(reactionRefusal(store.snapshot())).toMatchObject({ code: "token_unknown" });
  });
  hand.send(reactionEvent(message, [bob.name]));
  const kept = reactionRefusal(store.snapshot());
  store.toggle({ me: bob.name, message, reaction: "thumbs_down" });

  expect([kept, reactionRefusal(store.snapshot())]).toStrictEqual([
    expect.objectContaining({ code: "token_unknown" }),
    null,
  ]);
});

it("a reaction left while the link was down shows once the link is back", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const [message, me, bob] = await Promise.all([
    postedIn("store-reactions-gap"),
    adminName(),
    humanNamed("store-reactions-gap-bob"),
  ]);
  const { hand, store } = opened();
  store.toggle({ me, message, reaction: "thumbs_up" });
  await shows(store, message, [thumbsUpBy([me])]);

  hand.report("down");
  await bob.client.react(message.id, "thumbs_up");
  hand.report("up");

  await shows(store, message, [thumbsUpBy([me, bob.name])]);
});

it("a reaction event heard while reactions are read again wins over the value read", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const message = await postedIn("store-reactions-during");
  const [bob, me] = await Promise.all([humanNamed("store-reactions-during-bob"), adminName()]);
  const during = handLive();
  const store = createBoardStore({
    client: { ...adminClient(), getThread: sendingWhileRead(during, reactionEvent(message, [bob.name])) },
    live: createLive(during.adapter),
    url: webTestCookout().url,
  });
  onTestFinished(store.subscribeShowing("reactions")(vi.fn<() => void>()));
  during.send(reactionEvent(message, [me]));
  bounce(during);

  await shows(store, message, [thumbsUpBy([bob.name])]);
});

interface Unread {
  readonly name: string;
  readonly getThread: CookoutClient["getThread"];
}

async function keptAfterBack({ getThread, name }: Unread): Promise<readonly ReactionCount[]> {
  const message = await postedIn(name);
  const me = await adminName();
  const read = Promise.withResolvers<null>();
  const { hand, store } = opened({
    ...adminClient(),
    getThread: async (id) => {
      try {
        return await getThread(id);
      } finally {
        read.resolve(null);
      }
    },
  });
  hand.send(reactionEvent(message, [me]));
  bounce(hand);
  await read.promise;
  await Promise.resolve();

  expect(held(store, message)).toStrictEqual([thumbsUpBy([me])]);

  return held(store, message);
}

it("a held message whose thread can't be read again keeps its reactions", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await keptAfterBack({ getThread: refusedClient().getThread, name: "store-reactions-refused-read" });
});

it("a held message its thread no longer holds keeps its reactions", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const elsewhere = await postedIn("store-reactions-elsewhere");
  await keptAfterBack({
    getThread: async () => {
      const thread = await adminClient().getThread(elsewhere.id);
      return thread;
    },
    name: "store-reactions-moved",
  });
});
