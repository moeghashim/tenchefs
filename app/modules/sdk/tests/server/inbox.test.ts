import { Array as Arr, Effect } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import type { InboxItem, MessageId, PostMessageRequest } from "../../index.ts";
import { TestCookout, answer, messageId, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const MISSING = 999;
const NOT_FOUND = 404;
const ONE_REPLY = 1;
const BOOT = "2026-01-01T00:00:00.000Z";

interface Board {
  readonly ann: TestIdentity;
  readonly bob: TestIdentity;
}

function board(cookout: TestCookoutService): Effect.Effect<Board> {
  return Effect.gen(function* annAndBob() {
    const ann = yield* cookout.createIdentity("ann");
    const bob = yield* cookout.createIdentity("bob");
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    return { ann, bob };
  });
}

function post(who: TestIdentity, text: string, ...replyTo: readonly MessageId[]): Effect.Effect<MessageId> {
  const request: PostMessageRequest = Arr.match(replyTo, {
    onEmpty: () => ({ channel: "grill", text }),
    onNonEmpty: ([parent]) => ({ channel: "grill", replyTo: parent, text }),
  });
  return Effect.map(
    answer(() => who.client.createMessage(request)),
    ({ message }) => message.id,
  );
}

function reasonsOf(items: readonly InboxItem[]): unknown {
  return Arr.map(items, (item) => [item.message.id, item.reasons]);
}

it.effect("a mention puts the message in the mentioned identity's inbox, with its channel and thread", () =>
  Effect.gen(function* mentionInInbox() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const { message } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "@bob have a look" }));
    const { items } = yield* answer(() => bob.client.inbox());

    expect(items).toStrictEqual([
      {
        channel: { createdAt: BOOT, name: "grill" },
        message,
        parent: message,
        reasons: ["mention"],
      },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("starting a thread follows it, so its replies reach the inbox with their thread's parent", () =>
  Effect.gen(function* startFollows() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const { message: parent } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "parent" }));
    const { message: reply } = yield* answer(() =>
      bob.client.createMessage({ channel: "grill", replyTo: parent.id, text: "reply" }),
    );
    const { items } = yield* answer(() => ann.client.inbox());

    expect(items).toMatchObject([
      { message: reply, parent: { id: parent.id, replyCount: ONE_REPLY }, reasons: ["followed-thread"] },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a mention in a followed thread appears once with both reasons, and own messages never appear", () =>
  Effect.gen(function* mentionOnce() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const parent = yield* post(ann, "parent");
    const own = yield* post(ann, "my own @ann note", parent);
    const {
      message: { id: mention },
    } = yield* answer(() =>
      bob.client.createMessage({ channel: "grill", replyTo: parent, seen: own, text: "@ann over to you" }),
    );
    const { items } = yield* answer(() => ann.client.inbox());

    expect(reasonsOf(items)).toStrictEqual([[mention, ["followed-thread", "mention"]]]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("reading the inbox changes nothing, so unacked items keep showing", () =>
  Effect.gen(function* inboxIsRead() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    yield* post(bob, "@ann one");
    const first = yield* answer(() => ann.client.inbox());
    const second = yield* answer(() => ann.client.inbox());

    expect(second).toStrictEqual(first);
    expect(first.items).toHaveLength(ONE_REPLY);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an ack clears that message and everything before it in the same thread, and only that thread", () =>
  Effect.gen(function* ackClearsScope() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const parent = yield* post(ann, "parent");
    const other = yield* post(bob, "@ann elsewhere");
    yield* post(bob, "first", parent);
    const second = yield* post(bob, "second", parent);
    const { readPosition } = yield* answer(() => ann.client.ack(second));
    const { items } = yield* answer(() => ann.client.inbox());

    expect(readPosition).toStrictEqual({ channel: "grill", messageId: second, thread: parent });
    expect(reasonsOf(items)).toStrictEqual([[other, ["mention"]]]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("acking an older message after a newer one changes nothing", () =>
  Effect.gen(function* ackNeverBack() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const parent = yield* post(ann, "parent");
    const first = yield* post(bob, "first", parent);
    const second = yield* post(bob, "second", parent);
    yield* answer(() => ann.client.ack(second));
    const older = yield* answer(() => ann.client.ack(first));
    const { items } = yield* answer(() => ann.client.inbox());

    expect(older.readPosition.messageId).toBe(second);
    expect(items).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("following and unfollowing a thread by hand decides whether its replies reach the inbox", () =>
  Effect.gen(function* followByHand() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const parent = yield* post(bob, "parent");
    const followed = yield* answer(() => ann.client.follow(parent));
    const reply = yield* post(bob, "reply", parent);
    const unfollowed = yield* answer(() => ann.client.unfollow(reply));
    yield* post(bob, "unheard", parent);
    const { items } = yield* answer(() => ann.client.inbox());

    expect([followed, unfollowed]).toStrictEqual([
      { following: true, thread: parent },
      { following: false, thread: parent },
    ]);
    expect(items).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("subscribing to a channel brings its new top-level messages to the inbox until unsubscribing", () =>
  Effect.gen(function* subscribe() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const subscribed = yield* answer(() => ann.client.subscribe("grill"));
    const heard = yield* post(bob, "news");
    const inbox = yield* answer(() => ann.client.inbox());
    const unsubscribed = yield* Effect.andThen(
      answer(() => ann.client.ack(heard)),
      answer(() => ann.client.unsubscribe("grill")),
    );
    yield* post(bob, "more news");
    const after = yield* answer(() => ann.client.inbox());

    expect([subscribed, unsubscribed]).toStrictEqual([
      { channel: "grill", subscribed: true },
      { channel: "grill", subscribed: false },
    ]);
    expect([reasonsOf(inbox.items), after.items]).toStrictEqual([[[heard, ["subscribed-channel"]]], []]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("following message 0, which no message has, is 404 message_not_found", () =>
  Effect.gen(function* followZero() {
    const cookout = yield* TestCookout;
    const { ann } = yield* board(cookout);
    const response = yield* HttpClientRequest.put(`${cookout.url}/v1/messages/0/follow`).pipe(
      HttpClientRequest.setHeader("authorization", `Bearer ${ann.token}`),
      HttpClient.execute,
    );
    const json = yield* response.json;

    expect([response.status, json]).toMatchObject([NOT_FOUND, { error: { code: "message_not_found" } }]);
  }).pipe(Effect.provide([testCookout(), FetchHttpClient.layer])),
);

it.effect("following, unfollowing or acking a missing message, or subscribing to a missing channel, is 404", () =>
  Effect.gen(function* missing() {
    const cookout = yield* TestCookout;
    const { ann } = yield* board(cookout);
    const absent = messageId(MISSING);
    const errors = yield* Effect.all(
      [
        refusal(() => ann.client.follow(absent)),
        refusal(() => ann.client.unfollow(absent)),
        refusal(() => ann.client.ack(absent)),
        refusal(() => ann.client.subscribe("nowhere")),
        refusal(() => ann.client.unsubscribe("Not-A-Name")),
      ],
      { concurrency: 1 },
    );

    expect(errors).toMatchObject([
      { code: "message_not_found", status: NOT_FOUND },
      { code: "message_not_found", status: NOT_FOUND },
      { code: "message_not_found", status: NOT_FOUND },
      { code: "channel_not_found", status: NOT_FOUND },
      { code: "channel_not_found", status: NOT_FOUND },
    ]);
  }).pipe(Effect.provide(testCookout())),
);
