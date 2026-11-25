import { Array as Arr, Effect, Layer, Queue, Schedule, Stream } from "effect";
import { ScheduledMessages, scheduledMessagesOn } from "./service.ts";
import type { Announcing } from "./announced.ts";
import type { Identity } from "../../../identities/index.ts";
import { IdentityChanges } from "../../../identities/server.ts";
import { Messages } from "../../../messages/server.ts";
import type { Scope } from "effect";
import { Storage } from "../../../storage/server.ts";
import { announcingOn } from "./announced.ts";
import { runThenWait } from "./scheduler.ts";

const ONE_WAKE_IS_ENOUGH = 1;
const RETRY_AFTER_TROUBLE = "1 minute";
const IN_TURN = { concurrency: 1, discard: true } as const;

function pausedFor(storage: Storage["Service"], announcing: Announcing): (identity: Identity) => Effect.Effect<void> {
  return (identity) => {
    if (identity.deactivated !== true) {
      return Effect.void;
    }
    const announced = Effect.flatMap(storage.listScheduledMessages(), (schedules) =>
      Effect.forEach(
        Arr.filter(schedules, ({ creator, pausedBecause }) => creator === identity.name && pausedBecause !== null),
        (schedule) => announcing.shownAndAnnounced(schedule, false),
        IN_TURN,
      ),
    );
    return Effect.ignore(announced);
  };
}

interface Watching {
  readonly storage: Storage["Service"];
  readonly announcing: Announcing;
  readonly wake: Effect.Effect<void>;
}

function watchIdentities(watching: Watching): Effect.Effect<void, never, IdentityChanges | Scope.Scope> {
  return Effect.gen(function* wakeOnIdentityChanges() {
    const identities = yield* IdentityChanges;
    const changed = yield* identities.changed;
    const paused = pausedFor(watching.storage, watching.announcing);
    yield* Effect.forkScoped(
      Stream.runForEach(Stream.fromSubscription(changed), (identity) =>
        Effect.andThen(watching.wake, paused(identity)),
      ),
    );
  });
}

const scheduledMessagesLayer: Layer.Layer<ScheduledMessages, never, Storage | Messages | IdentityChanges> =
  Layer.effect(
    ScheduledMessages,
    Effect.gen(function* scheduleMessages() {
      const storage = yield* Storage;
      const messages = yield* Messages;
      const wakes = yield* Queue.sliding<true>(ONE_WAKE_IS_ENOUGH);
      const wake = Effect.asVoid(Queue.offer(wakes, true));
      const announcing = yield* announcingOn(storage);
      yield* watchIdentities({ announcing, storage, wake });
      const step = runThenWait({ announcing, messages, storage, woken: Queue.take(wakes) }).pipe(
        Effect.retry(Schedule.spaced(RETRY_AFTER_TROUBLE)),
      );
      yield* Effect.forkScoped(Effect.forever(step));
      return scheduledMessagesOn({ announcing, storage, wake });
    }),
  );

export { scheduledMessagesLayer };
