import type { CookoutEvent, EventStream } from "../../index.ts";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

type Feed = AsyncIterator<CookoutEvent, unknown>;

function isPresenceOrEnd(next: Readonly<IteratorResult<CookoutEvent, unknown>>): boolean {
  return next.done === true || next.value.type === "presence";
}

function nextPresence(feed: Feed): Effect.Effect<IteratorResult<CookoutEvent, unknown>> {
  return answer(() => feed.next()).pipe(Effect.repeat({ until: isPresenceOrEnd }));
}

it.effect("an all-channels feed sends its own caller coming online, so a tab hears that it is present", () =>
  Effect.gen(function* ownPresenceEvent() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann", { kind: "human" });
    const events = yield* Effect.acquireRelease(
      answer(() => ann.client.watch({ allChannels: true })),
      (opened: EventStream) => answer(() => opened.close()),
    );
    const cameOnline = yield* nextPresence(events[Symbol.asyncIterator]());

    expect(cameOnline).toStrictEqual({
      done: false,
      value: { presence: { connection: { via: "watch" }, identity: "ann", online: true }, type: "presence" },
    });
  }).pipe(Effect.provide(testCookout())),
);
