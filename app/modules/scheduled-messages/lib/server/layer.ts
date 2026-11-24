import { Effect, Layer, Queue, Schedule, Stream } from "effect";
import { ScheduledMessages, scheduledMessagesOn } from "./service.ts";
import { IdentityChanges } from "../../../identities/server.ts";
import { Messages } from "../../../messages/server.ts";
import { Storage } from "../../../storage/server.ts";
import { runThenWait } from "./scheduler.ts";

const ONE_WAKE_IS_ENOUGH = 1;
const RETRY_AFTER_TROUBLE = "1 minute";

const scheduledMessagesLayer: Layer.Layer<ScheduledMessages, never, Storage | Messages | IdentityChanges> =
  Layer.effect(
    ScheduledMessages,
    Effect.gen(function* scheduleMessages() {
      const storage = yield* Storage;
      const messages = yield* Messages;
      const identities = yield* IdentityChanges;
      const wakes = yield* Queue.sliding<true>(ONE_WAKE_IS_ENOUGH);
      const wake = Effect.asVoid(Queue.offer(wakes, true));
      const changed = yield* identities.changed;
      yield* Effect.forkScoped(Stream.runForEach(Stream.fromSubscription(changed), () => wake));
      const step = runThenWait({ messages, storage, woken: Queue.take(wakes) }).pipe(
        Effect.retry(Schedule.spaced(RETRY_AFTER_TROUBLE)),
      );
      yield* Effect.forkScoped(Effect.forever(step));
      return scheduledMessagesOn({ storage, wake });
    }),
  );

export { scheduledMessagesLayer };
