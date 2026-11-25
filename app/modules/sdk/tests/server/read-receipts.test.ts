import { TestCookout, answer, testCookout, watchingAllChannels } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { TestClock } from "effect/testing";
import type { TestIdentity } from "../../../testing/server.ts";

const A_MINUTE_IN = "2026-01-01T00:01:00.000Z";

interface InGrill {
  readonly cookout: TestCookout["Service"];
  readonly ann: TestIdentity;
  readonly bob: TestIdentity;
}

const annAndBobInGrill: Effect.Effect<InGrill, never, TestCookout> = Effect.gen(function* createAnnAndBob() {
  const cookout = yield* TestCookout;
  const ann = yield* cookout.createIdentity("ann");
  const bob = yield* cookout.createIdentity("bob");
  yield* answer(() => ann.client.createChannel({ name: "grill" }));
  return { ann, bob, cookout };
});

it.effect("a message that mentions bob has a receipt for bob, not seen until bob acks it", () =>
  Effect.gen(function* mentionReceipt() {
    const { ann, bob } = yield* annAndBobInGrill;
    const { message } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "@bob look" }));
    const before = yield* answer(() => ann.client.getThread(message.id));
    yield* TestClock.adjust("1 minute");

    yield* answer(() => bob.client.ack(message.id));
    const after = yield* answer(() => ann.client.getThread(message.id));
    const page = yield* answer(() => ann.client.listMessages("grill"));

    expect({ after: after.receipts, before: before.receipts, page: page.receipts }).toStrictEqual({
      after: [{ identity: "bob", messageId: message.id, seen: true, seenAt: A_MINUTE_IN }],
      before: [{ identity: "bob", messageId: message.id, seen: false }],
      page: [{ identity: "bob", messageId: message.id, seen: true, seenAt: A_MINUTE_IN }],
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a reply has a receipt for the parent's author, but not when the author replies to their own message", () =>
  Effect.gen(function* replyReceipts() {
    const { ann, bob } = yield* annAndBobInGrill;
    const { message: parent } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "plain" }));
    const { message: mine } = yield* answer(() =>
      ann.client.createMessage({ channel: "grill", replyTo: parent.id, text: "my own" }),
    );
    const own = yield* answer(() => ann.client.getThread(parent.id));
    const { message: reply } = yield* answer(() =>
      bob.client.createMessage({ channel: "grill", replyTo: parent.id, seen: mine.id, text: "an answer" }),
    );

    const thread = yield* answer(() => ann.client.getThread(parent.id));

    expect({ own: own.receipts, thread: thread.receipts }).toStrictEqual({
      own: [],
      thread: [{ identity: "ann", messageId: reply.id, seen: false }],
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("replying in a thread records the replier's receipts for the replies its read position passes", () =>
  Effect.gen(function* replyingSees() {
    const { ann, bob } = yield* annAndBobInGrill;
    const { message: parent } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "plain" }));
    const { message: reply } = yield* answer(() =>
      bob.client.createMessage({ channel: "grill", replyTo: parent.id, text: "an answer" }),
    );
    yield* TestClock.adjust("1 minute");

    yield* answer(() =>
      ann.client.createMessage({ channel: "grill", replyTo: parent.id, seen: reply.id, text: "thanks" }),
    );
    const thread = yield* answer(() => bob.client.getThread(parent.id));

    expect(thread.receipts).toStrictEqual([{ identity: "ann", messageId: reply.id, seen: true, seenAt: A_MINUTE_IN }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "an ack of a later message records receipts it passes, and Mark unread then an ack keeps the first time",
  () =>
    Effect.gen(function* firstPass() {
      const { ann, bob } = yield* annAndBobInGrill;
      const { message: first } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "@bob one" }));
      const { message: second } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "two" }));
      yield* TestClock.adjust("1 minute");
      yield* answer(() => bob.client.ack(second.id));
      yield* answer(() => bob.client.markUnread(first.id));
      yield* TestClock.adjust("1 minute");

      yield* answer(() => bob.client.ack(second.id));
      const page = yield* answer(() => ann.client.listMessages("grill"));

      expect(page.receipts).toStrictEqual([{ identity: "bob", messageId: first.id, seen: true, seenAt: A_MINUTE_IN }]);
    }).pipe(Effect.provide(testCookout())),
);

it.effect("a message that mentions nobody and isn't a reply has no receipts", () =>
  Effect.gen(function* noReceipts() {
    const { ann } = yield* annAndBobInGrill;
    const { message } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "plain" }));

    const thread = yield* answer(() => ann.client.getThread(message.id));
    const page = yield* answer(() => ann.client.listMessages("grill"));

    expect({ page: page.receipts, thread: thread.receipts }).toStrictEqual({ page: [], thread: [] });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the all-channels feed sends a read-receipt event for a new receipt, and none for others' acks", () =>
  Effect.gen(function* receiptEvent() {
    const { ann, bob, cookout } = yield* annAndBobInGrill;
    const dan = yield* cookout.createIdentity("dan");
    const cat = yield* cookout.createIdentity("cat", { kind: "human" });
    const events = yield* watchingAllChannels(cat);
    const { message } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "@bob look" }));
    yield* answer(() => events.next());

    yield* answer(() => dan.client.ack(message.id));
    yield* answer(() => bob.client.ack(message.id));
    const event = yield* answer(() => events.next());

    expect(event.value).toStrictEqual({
      receipt: { identity: "bob", messageId: message.id, seen: true, seenAt: "2026-01-01T00:00:00.000Z" },
      type: "read-receipt",
    });
  }).pipe(Effect.provide(testCookout())),
);
