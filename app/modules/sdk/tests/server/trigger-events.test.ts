import { AGENT, AT, OK, URL_OF, board } from "./trigger-board.ts";
import type { CookoutClient, CookoutEvent, EventStream } from "../../index.ts";
import { answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Scope } from "effect";

const ONCE = 1;

function watching(client: CookoutClient): Effect.Effect<AsyncIterator<CookoutEvent>, never, Scope.Scope> {
  return Effect.map(
    Effect.acquireRelease(
      answer(() => client.watch()),
      (events: EventStream) => answer(() => events.close()),
    ),
    (events) => events[Symbol.asyncIterator](),
  );
}

function eventIn(next: Readonly<IteratorResult<CookoutEvent>>): CookoutEvent | null {
  if (next.done === true) {
    return null;
  }
  return next.value;
}

function heardBefore(
  events: AsyncIterator<CookoutEvent>,
  stop: CookoutEvent["type"],
): Effect.Effect<CookoutEvent | null> {
  const next = answer(() => events.next());
  return Effect.map(
    Effect.repeat(next, {
      until: (heard: Readonly<IteratorResult<CookoutEvent>>) =>
        heard.done === true || heard.value.type === "trigger" || heard.value.type === stop,
    }),
    eventIn,
  );
}

it.effect("a trigger call sends the trigger, with how the call went, to its owner's stream as a trigger event", () =>
  Effect.gen(function* triggerEventToOwner() {
    const on = yield* board;
    const events = yield* watching(on.matt.client);
    yield* on.mention();
    yield* on.cookout.triggers.waitForCalls(ONCE);
    const heard = yield* heardBefore(events, "nudge");

    expect(heard).toStrictEqual({
      identity: AGENT,
      trigger: { lastResult: { at: AT, ok: true, status: OK }, url: URL_OF },
      type: "trigger",
    });
  }).pipe(Effect.scoped, Effect.provide(testCookout({ triggers: "scripted" }))),
);

it.effect(
  "a trigger event reaches no one but the agent's owner and the agent that brought it in: not the mentioner",
  () =>
    Effect.gen(function* triggerEventToNoOneElse() {
      const on = yield* board;
      const events = yield* watching(on.ada.client);
      yield* on.mention();
      yield* on.settled(() => true);
      yield* answer(() => on.matt.client.createMessage({ channel: "grill", text: "@ada after the call" }));
      const heard = yield* heardBefore(events, "inbox-item");

      expect(heard).toMatchObject({ item: { message: { text: "@ada after the call" } }, type: "inbox-item" });
    }).pipe(Effect.scoped, Effect.provide(testCookout({ triggers: "scripted" }))),
);
