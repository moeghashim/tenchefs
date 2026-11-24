import { DateTime, Effect, Predicate, Result } from "effect";
import type { Storage, StorageUnavailable, StoredScheduledMessage } from "../../../storage/server.ts";
import type { CreateScheduledMessageRequestSchema } from "./wire.ts";
import type { Identity } from "../../../identities/index.ts";
import type { Refusal } from "../../../http/index.ts";
import { channelNotFound } from "../../../channels/server.ts";
import { isChannelName } from "../../../channels/index.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { timingOf } from "./timing.ts";
import { timingRefusal } from "./refusals.ts";

type NewScheduledMessageRequest = typeof CreateScheduledMessageRequestSchema.Type;

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

interface Creating {
  readonly storage: Storage["Service"];
  readonly caller: Identity;
  readonly asked: NewScheduledMessageRequest;
}

function stored({ asked, caller, storage }: Creating, now: DateTime.Utc): Fails<StoredScheduledMessage | undefined> {
  const timing = timingOf({ ...asked, now });
  if (Result.isFailure(timing)) {
    return Effect.fail(timingRefusal(timing.failure));
  }
  const { channel, text } = asked;
  if (!isChannelName(channel)) {
    return Effect.undefined;
  }
  return storage.createScheduledMessage({
    ...timing.success,
    channel,
    createdAt: isoTimeOf(now),
    creator: caller.name,
    text,
  });
}

function createdBy(creating: Creating): Fails<StoredScheduledMessage> {
  return Effect.flatMap(DateTime.now, (now) =>
    Effect.filterOrFail(stored(creating, now), Predicate.isNotUndefined, () => channelNotFound(creating.asked.channel)),
  );
}

function channelKnown({ channel, storage }: Pick<Creating, "storage"> & { readonly channel: string }): Fails<void> {
  if (!isChannelName(channel)) {
    return Effect.fail(channelNotFound(channel));
  }
  return Effect.flatMap(storage.findChannel(channel), (known) =>
    Effect.asVoid(Effect.mapError(Effect.fromNullishOr(known), () => channelNotFound(channel))),
  );
}

export { type NewScheduledMessageRequest, channelKnown, createdBy };
