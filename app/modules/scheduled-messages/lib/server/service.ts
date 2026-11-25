import { Array as Arr, Context, Effect, Predicate } from "effect";
import type { Changes, ScheduledOn } from "./changes.ts";
import type { Storage, StorageUnavailable } from "../../../storage/server.ts";
import { channelKnown, createdBy } from "./create.ts";
import type { Announcing } from "./announced.ts";
import type { Identity } from "../../../identities/index.ts";
import type { NewScheduledMessageRequest } from "./create.ts";
import type { Refusal } from "../../../http/index.ts";
import type { ScheduledMessage } from "../../index.ts";
import { changesOn } from "./changes.ts";
import { shownWith } from "./shown.ts";

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

interface ScheduledMessagesService extends Changes, Pick<Announcing, "changed"> {
  readonly create: (caller: Identity, asked: NewScheduledMessageRequest) => Fails<ScheduledMessage>;
  readonly list: (channel: string | undefined) => Fails<readonly ScheduledMessage[]>;
}

const SEQUENTIAL = { concurrency: 1 } as const;

class ScheduledMessages extends Context.Service<ScheduledMessages, ScheduledMessagesService>()(
  "@ai-hero/cookout/scheduled-messages/lib/server/service/ScheduledMessages",
) {}

function listWith(storage: Storage["Service"]): ScheduledMessagesService["list"] {
  return (channel) => {
    const listed = Effect.map(
      storage.listScheduledMessages(),
      Arr.filter((schedule) => Predicate.isUndefined(channel) || schedule.channel === channel),
    );
    const shown = Effect.flatMap(listed, Effect.forEach(shownWith(storage), SEQUENTIAL));
    if (Predicate.isUndefined(channel)) {
      return shown;
    }
    return Effect.andThen(channelKnown({ channel, storage }), shown);
  };
}

function scheduledMessagesOn(on: ScheduledOn): ScheduledMessagesService {
  return {
    ...changesOn(on),
    changed: on.announcing.changed,
    create: (caller, asked) =>
      Effect.flatMap(createdBy({ asked, caller, storage: on.storage }), (created) =>
        Effect.andThen(on.wake, on.announcing.shownAndAnnounced(created, false)),
      ),
    list: listWith(on.storage),
  };
}

export { ScheduledMessages, scheduledMessagesOn };
