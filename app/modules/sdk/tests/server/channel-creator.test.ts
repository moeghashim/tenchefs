import type { CookoutClient, CookoutEvent, EventStream } from "../../index.ts";
import { TestCookout, answer, testCookout, watchingAllChannels } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Scope } from "effect";

const ONE_AT_A_TIME = { concurrency: 1 } as const;

function watching(
  client: CookoutClient,
  allChannels: boolean,
): Effect.Effect<AsyncIterator<CookoutEvent>, never, Scope.Scope> {
  return Effect.map(
    Effect.acquireRelease(
      answer(() => client.watch({ allChannels })),
      (events: EventStream) => answer(() => events.close()),
    ),
    (events) => events[Symbol.asyncIterator](),
  );
}

it.effect("whoever creates a channel is subscribed, and its next top-level post reaches their inbox", () =>
  Effect.gen(function* creatorSubscribed() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann");
    const bob = yield* cookout.createIdentity("bob");
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    const { message } = yield* answer(() => bob.client.createMessage({ channel: "grill", text: "lunch?" }));
    const listed = yield* Effect.all(
      { ann: answer(ann.client.listSubscribedChannels), bob: answer(bob.client.listSubscribedChannels) },
      ONE_AT_A_TIME,
    );
    const { items } = yield* answer(() => ann.client.inbox());

    expect(listed).toMatchObject({ ann: { channels: [{ name: "grill" }] }, bob: { channels: [] } });
    expect(items).toMatchObject([{ message: { id: message.id }, reasons: ["subscribed-channel"] }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the creator can unsubscribe from a channel at once", () =>
  Effect.gen(function* creatorUnsubscribes() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann");
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    const unsubscribed = yield* answer(() => ann.client.unsubscribe("grill"));
    const listed = yield* answer(ann.client.listSubscribedChannels);

    expect([unsubscribed, listed]).toStrictEqual([{ channel: "grill", subscribed: false }, { channels: [] }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the creator's other sessions hear the new channel and their subscription to it", () =>
  Effect.gen(function* creatorHears() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann");
    const events = yield* watchingAllChannels(ann);
    const { channel } = yield* answer(() => ann.client.createChannel({ name: "grill" }));
    const first = yield* answer(() => events.next());
    const second = yield* answer(() => events.next());

    expect([first.value, second.value]).toStrictEqual(
      expect.arrayContaining([
        { channel, type: "channel" },
        { subscription: { channel: "grill", subscribed: true }, type: "subscription" },
      ]),
    );
  }).pipe(Effect.provide(testCookout())),
);

it.effect("subscribing and unsubscribing reach the caller's other sessions, and no one else's", () =>
  Effect.gen(function* subscriptionHeard() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann");
    const bob = yield* cookout.createIdentity("bob");
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    const annEvents = yield* watching(ann.client, false);
    const bobEvents = yield* watching(bob.client, false);
    yield* Effect.all(
      [
        answer(() => ann.client.subscribe("grill")),
        answer(() => ann.client.unsubscribe("grill")),
        answer(() => bob.client.subscribe("grill")),
      ],
      { concurrency: 1, discard: true },
    );
    const heard = yield* Effect.all(
      [answer(() => annEvents.next()), answer(() => annEvents.next()), answer(() => bobEvents.next())],
      ONE_AT_A_TIME,
    );

    expect(heard).toStrictEqual([
      { done: false, value: { subscription: { channel: "grill", subscribed: true }, type: "subscription" } },
      { done: false, value: { subscription: { channel: "grill", subscribed: false }, type: "subscription" } },
      { done: false, value: { subscription: { channel: "grill", subscribed: true }, type: "subscription" } },
    ]);
  }).pipe(Effect.provide(testCookout())),
);
