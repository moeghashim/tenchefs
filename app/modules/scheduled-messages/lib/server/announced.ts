import { Effect, PubSub } from "effect";
import type { ScheduledMessage, ScheduledMessageEvent } from "../../index.ts";
import type { Storage, StorageUnavailable, StoredScheduledMessage } from "../../../storage/server.ts";
import type { Scope } from "effect";
import { shownWith } from "./shown.ts";

type ScheduledMessageChange = Omit<ScheduledMessageEvent, "type">;

interface Announcing {
  readonly shown: (stored: StoredScheduledMessage) => Effect.Effect<ScheduledMessage, StorageUnavailable>;
  readonly shownAndAnnounced: (
    stored: StoredScheduledMessage,
    deleted: boolean,
  ) => Effect.Effect<ScheduledMessage, StorageUnavailable>;
  readonly changed: Effect.Effect<PubSub.Subscription<ScheduledMessageChange>, never, Scope.Scope>;
}

function announcingOn(storage: Storage["Service"]): Effect.Effect<Announcing> {
  return Effect.gen(function* announceChanges() {
    const hub = yield* PubSub.unbounded<ScheduledMessageChange>();
    const shown = shownWith(storage);
    return {
      changed: PubSub.subscribe(hub),
      shown,
      shownAndAnnounced: (stored, deleted) =>
        Effect.tap(shown(stored), (scheduledMessage) => PubSub.publish(hub, { deleted, scheduledMessage })),
    };
  });
}

export { type Announcing, announcingOn };
