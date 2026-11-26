import { Array as Arr, Effect, Option, Order } from "effect";
import type { Attachment, CookoutEvent, Message, MessageId, Nudge } from "../../index.ts";
import { TestCookout, answer, refusal, testCookout, watchingAllChannels } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { TestClock } from "effect/testing";
import type { TestIdentity } from "../../../testing/server.ts";

const HUMAN = { kind: "human" } as const;
const NOT_FOUND = 404;
const TWO = 2;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const SETTLE = "30 millis";
const SQLITE = { storage: "sqlite" } as const;
const FILE_BYTES = 3;
const MISSING = { code: "message_not_found", status: NOT_FOUND };

const settled: Effect.Effect<void> = TestClock.withLive(Effect.sleep(SETTLE));

interface Board {
  readonly ada: TestIdentity;
  readonly bob: TestIdentity;
  readonly doomed: Message;
  readonly reply: Message;
  readonly kept: Message;
}

interface People {
  readonly ada: TestIdentity;
  readonly bob: TestIdentity;
}

const people: Effect.Effect<People, never, TestCookout> = Effect.gen(function* openGrill() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", HUMAN);
  const bob = yield* cookout.createIdentity("bob", HUMAN);
  yield* answer(() => ada.client.createChannel({ name: "grill" }));
  yield* answer(() => bob.client.subscribe("grill"));
  return { ada, bob };
});

const board: Effect.Effect<Board, never, TestCookout> = Effect.gen(function* openBoard() {
  const { ada, bob } = yield* people;
  const bytes = new Uint8Array(FILE_BYTES);
  const { message: doomed } = yield* answer(() =>
    ada.client.createMessage({
      attachments: [{ bytes, name: "plan.bin" }],
      channel: "grill",
      text: "@bob grilled corn",
    }),
  );
  const { message: reply } = yield* answer(() =>
    bob.client.createMessage({ channel: "grill", replyTo: doomed.id, text: "grilled reply" }),
  );
  yield* answer(() => bob.client.react(doomed.id, "thumbs_up"));
  const { message: kept } = yield* answer(() => ada.client.createMessage({ channel: "grill", text: "grilled kept" }));
  return { ada, bob, doomed, kept, reply };
});

function idsOf(items: readonly { readonly message: Message }[]): readonly MessageId[] {
  return Arr.dedupe(Arr.map(items, ({ message }) => message.id));
}

function nudgedIn(nudges: readonly Nudge[]): readonly MessageId[] {
  return Arr.map(nudges, ({ parent }) => parent.id);
}

function attachmentOf(message: Message): Attachment {
  return Option.getOrThrow(Arr.head(message.attachments ?? []));
}

function inboxOf(who: TestIdentity): Effect.Effect<readonly MessageId[]> {
  return Effect.map(
    answer(() => who.client.inbox()),
    ({ items }) => idsOf(items),
  );
}

function historyOf(who: TestIdentity): Effect.Effect<readonly MessageId[]> {
  return Effect.map(
    answer(() => who.client.inboxHistory()),
    ({ items }) => idsOf(items),
  );
}

function searchedBy(who: TestIdentity): Effect.Effect<readonly MessageId[]> {
  return Effect.map(
    answer(() => who.client.search({ query: "grilled" })),
    ({ results }) => idsOf(results),
  );
}

function openThreadsOf(who: TestIdentity): Effect.Effect<readonly MessageId[]> {
  return Effect.map(
    answer(() => who.client.listOpenThreads({ all: true })),
    ({ threads }) => idsOf(threads),
  );
}

interface Reads {
  readonly adaHistory: readonly MessageId[];
  readonly bobHistory: readonly MessageId[];
  readonly bobInbox: readonly MessageId[];
  readonly open: readonly MessageId[];
  readonly search: readonly MessageId[];
}

function readsOf({ ada, bob }: Board): Effect.Effect<Reads> {
  return Effect.all(
    {
      adaHistory: historyOf(ada),
      bobHistory: historyOf(bob),
      bobInbox: inboxOf(bob),
      open: openThreadsOf(ada),
      search: searchedBy(ada),
    },
    ONE_AT_A_TIME,
  );
}

it.effect(
  "a deleted thread leaves the Inbox and its history, search and open threads, and its Attachment isn't served",
  () =>
    Effect.gen(function* deletedThreadReads() {
      const filled = yield* board;
      const { ada, bob, doomed, kept, reply } = filled;
      const before = yield* readsOf(filled);
      yield* answer(() => ada.client.deleteMessage(doomed.id));
      const after = yield* readsOf(filled);
      const attachment = yield* refusal(() => bob.client.getAttachment(attachmentOf(doomed).id));

      expect(Arr.every([before.adaHistory, before.bobInbox, before.open, before.search], Arr.contains(doomed.id))).toBe(
        true,
      );
      expect([Arr.contains(before.adaHistory, reply.id), Arr.contains(before.search, reply.id)]).toStrictEqual([
        true,
        true,
      ]);
      expect(after).toStrictEqual({
        adaHistory: [],
        bobHistory: [kept.id],
        bobInbox: [kept.id],
        open: [kept.id],
        search: [kept.id],
      });
      expect(attachment).toMatchObject({ code: "attachment_not_found", status: NOT_FOUND });
    }).pipe(Effect.provide(testCookout(SQLITE))),
);

it.effect("a deleted reply leaves its thread's follower's Inbox and search, and the thread stays", () =>
  Effect.gen(function* deletedReplyReads() {
    const { ada, bob, doomed, reply } = yield* board;
    const before = yield* inboxOf(ada);
    yield* answer(() => bob.client.deleteMessage(reply.id));
    const after = yield* Effect.all({ inbox: inboxOf(ada), search: searchedBy(ada) }, ONE_AT_A_TIME);

    expect(before).toContain(reply.id);
    expect(after.inbox).not.toContain(reply.id);
    expect(after.search).not.toContain(reply.id);
    expect(after.search).toContain(doomed.id);
  }).pipe(Effect.provide(testCookout(SQLITE))),
);

it.effect("reacting to, unreacting, acking or marking unread a deleted message is 404 message_not_found", () =>
  Effect.gen(function* actOnDeleted() {
    const { ada, bob, doomed, reply } = yield* board;
    yield* answer(() => ada.client.deleteMessage(doomed.id));
    const refused = yield* Effect.all(
      [
        refusal(() => bob.client.react(doomed.id, "thumbs_down")),
        refusal(() => bob.client.unreact(doomed.id, "thumbs_up")),
        refusal(() => bob.client.ack(doomed.id)),
        refusal(() => bob.client.markUnread(doomed.id)),
        refusal(() => ada.client.ack(reply.id)),
      ],
      ONE_AT_A_TIME,
    );

    expect(refused).toMatchObject([MISSING, MISSING, MISSING, MISSING, MISSING]);
  }).pipe(Effect.provide(testCookout(SQLITE))),
);

function receiptHeardBy(watcher: TestIdentity, acking: Effect.Effect<unknown>): Effect.Effect<CookoutEvent | null> {
  return Effect.scoped(
    Effect.gen(function* ackWhileWatching() {
      const events = yield* watchingAllChannels(watcher);
      yield* acking;
      const next = yield* answer(() => events.next());
      if (next.done === true) {
        return null;
      }
      return next.value;
    }),
  );
}

it.effect("an ack that passes a deleted mention sends no read receipt for it", () =>
  Effect.gen(function* noReceiptForDeleted() {
    const { ada, bob, doomed } = yield* board;
    const cookout = yield* TestCookout;
    const cat = yield* cookout.createIdentity("cat", HUMAN);
    const { message: later } = yield* answer(() =>
      ada.client.createMessage({ channel: "grill", text: "@bob grilled later" }),
    );
    yield* answer(() => ada.client.deleteMessage(doomed.id));
    const event = yield* receiptHeardBy(
      cat,
      answer(() => bob.client.ack(later.id)),
    );

    expect(event).toStrictEqual({
      receipt: { identity: "bob", messageId: later.id, seen: true, seenAt: "2026-01-01T00:00:00.000Z" },
      type: "read-receipt",
    });
  }).pipe(Effect.provide(testCookout(SQLITE))),
);

function nudgesOf(who: TestIdentity): Effect.Effect<readonly MessageId[]> {
  return Effect.map(
    answer(() => who.client.inbox()),
    ({ nudges }) => nudgedIn(nudges),
  );
}

function historyNudgesOf(who: TestIdentity): Effect.Effect<readonly MessageId[]> {
  return Effect.map(
    answer(() => who.client.inboxHistory()),
    ({ nudges }) => nudgedIn(nudges),
  );
}

it.effect("a Nudge about a deleted thread is no longer listed, in the Inbox or its history", () =>
  Effect.gen(function* deletedNudge() {
    const { ada, doomed, kept } = yield* board;
    yield* Effect.andThen(Effect.andThen(settled, TestClock.adjust("4 days")), settled);
    const before = yield* Effect.repeat(nudgesOf(ada), { until: (ids) => ids.length >= TWO });
    yield* answer(() => ada.client.deleteMessage(doomed.id));
    const after = yield* Effect.all({ history: historyNudgesOf(ada), inbox: nudgesOf(ada) }, ONE_AT_A_TIME);

    expect(Arr.sort(before, Order.Number)).toStrictEqual([doomed.id, kept.id]);
    expect(after).toStrictEqual({ history: [kept.id], inbox: [kept.id] });
  }).pipe(Effect.provide(testCookout(SQLITE))),
);
