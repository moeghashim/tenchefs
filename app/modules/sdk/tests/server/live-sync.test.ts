import type { CookoutClient, CookoutEvent, EventStream, WatchOptions } from "../../index.ts";
import { TestCookout, answer, testCookout, watchingAllChannels } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Scope } from "effect";

function watching(
  client: CookoutClient,
  options?: WatchOptions,
): Effect.Effect<AsyncIterator<CookoutEvent>, never, Scope.Scope> {
  return Effect.map(
    Effect.acquireRelease(
      answer(() => client.watch(options)),
      (events: EventStream) => answer(() => events.close()),
    ),
    (events) => events[Symbol.asyncIterator](),
  );
}

it.effect("an ack in one session reaches the identity's open stream in another as a read-position event", () =>
  Effect.gen(function* ackReachesOtherSession() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann");
    const bob = yield* cookout.createIdentity("bob");
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    const { message } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "@bob have a look" }));
    const events = yield* watching(bob.client);
    const { readPosition } = yield* answer(() => cookout.clientFor(bob.token).ack(message.id));
    const event = yield* answer(() => events.next());

    expect(event).toStrictEqual({ done: false, value: { readPosition, type: "read-position" } });
    expect(readPosition).toStrictEqual({ channel: "grill", messageId: message.id, thread: null });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("another identity's ack doesn't reach the stream", () =>
  Effect.gen(function* otherAckSkipped() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann");
    const bob = yield* cookout.createIdentity("bob");
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    const { message: toAnn } = yield* answer(() => bob.client.createMessage({ channel: "grill", text: "@ann hi" }));
    const events = yield* watching(bob.client);
    yield* answer(() => ann.client.ack(toAnn.id));
    const { message: toBob } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "@bob hi" }));
    const event = yield* answer(() => events.next());

    expect(event).toMatchObject({ value: { item: { message: { id: toBob.id } }, type: "inbox-item" } });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("with the all-channels option, a message in a channel the caller doesn't follow arrives", () =>
  Effect.gen(function* allChannelsArrives() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann");
    const bob = yield* cookout.createIdentity("bob");
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    const events = yield* watchingAllChannels(bob);
    const { message } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "smoke's up" }));
    const event = yield* answer(() => events.next());

    expect(event).toStrictEqual({ done: false, value: { message, type: "message" } });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("without the all-channels option, a message in a channel the caller doesn't follow doesn't arrive", () =>
  Effect.gen(function* allChannelsSkipped() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann");
    const bob = yield* cookout.createIdentity("bob");
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    const events = yield* watching(bob.client);
    yield* answer(() => ann.client.createMessage({ channel: "grill", text: "smoke's up" }));
    const { message } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "@bob look" }));
    const event = yield* answer(() => events.next());

    expect(event).toMatchObject({ value: { item: { message: { id: message.id } }, type: "inbox-item" } });
  }).pipe(Effect.provide(testCookout())),
);
