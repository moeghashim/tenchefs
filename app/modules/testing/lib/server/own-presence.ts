import type { CookoutEvent, EventStream } from "../../../sdk/index.ts";
import { Effect, Function } from "effect";
import type { Scope } from "effect";
import type { TestIdentity } from "./cookout.ts";
import { answer } from "./calls.ts";

type Feed = AsyncIterator<CookoutEvent, unknown>;

interface Reading {
  readonly events: Feed;
  readonly name: string;
}

function isOnlineAs(name: string): (next: Readonly<IteratorResult<CookoutEvent, unknown>>) => boolean {
  return (next) =>
    next.done === true ||
    (next.value.type === "presence" && next.value.presence.identity === name && next.value.presence.online);
}

function pastOwnPresence({ events, name }: Reading): Effect.Effect<void> {
  return answer(() => events.next()).pipe(Effect.repeat({ until: isOnlineAs(name) }), Effect.asVoid);
}

function watchingAllChannels({ client, identity }: TestIdentity): Effect.Effect<Feed, never, Scope.Scope> {
  return Effect.gen(function* watchPastOwnPresence() {
    const opened = yield* Effect.acquireRelease(
      answer(() => client.watch({ allChannels: true })),
      (events: EventStream) =>
        Effect.ignore(Effect.tryPromise({ catch: Function.constVoid, try: () => events.close() })),
    );
    const events = opened[Symbol.asyncIterator]();
    yield* pastOwnPresence({ events, name: identity.name });
    return events;
  });
}

export { pastOwnPresence, watchingAllChannels };
