import type { AppendMessageResult, MessagesSection } from "./messages.ts";
import { DateTime, Effect } from "effect";
import type { DeactivationsSection } from "./identity-deactivations.ts";
import type { IdentityName } from "../../../identities/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { PresenceSection } from "./presence.ts";
import type { ReactionsSection } from "./reactions.ts";
import type { StorageUnavailable } from "./errors.ts";
import type { WebhookCommandCallsSection } from "./command-calls.ts";
import { isoTimeOf } from "../../../time/server.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

type RecordActivity = (identity: IdentityName, at: IsoTime) => Fails<void>;

type ActivityWrites = Pick<PresenceSection, "recordPresence"> &
  Pick<DeactivationsSection, "reactivateIdentity"> &
  Pick<MessagesSection, "appendMessage"> &
  Pick<WebhookCommandCallsSection, "appendWebhookCommandCall"> &
  Pick<ReactionsSection, "addReaction">;

function postedBy(record: RecordActivity): (result: AppendMessageResult) => Fails<void> {
  return (result) => {
    if (result.status !== "appended") {
      return Effect.void;
    }
    return record(result.message.author.name, result.message.createdAt);
  };
}

function calledOn(record: RecordActivity, handler: IdentityName): (result: AppendMessageResult) => Fails<void> {
  return (result) => {
    if (result.status !== "appended") {
      return Effect.void;
    }
    return record(handler, result.message.createdAt);
  };
}

function recordingActivity(writes: ActivityWrites, record: RecordActivity): ActivityWrites {
  return {
    addReaction: (reaction) =>
      Effect.tap(writes.addReaction(reaction), (added) => {
        if (added !== true) {
          return Effect.void;
        }
        return record(reaction.identity, reaction.reactedAt);
      }),
    appendMessage: (message) => Effect.tap(writes.appendMessage(message), postedBy(record)),
    appendWebhookCommandCall: (call) =>
      Effect.tap(writes.appendWebhookCommandCall(call), (result) =>
        Effect.andThen(postedBy(record)(result), calledOn(record, call.token.handler)(result)),
      ),
    reactivateIdentity: (name, hash) =>
      Effect.tap(writes.reactivateIdentity(name, hash), (result) => {
        if (result.status !== "reactivated") {
          return Effect.void;
        }
        return Effect.flatMap(DateTime.now, (now) => record(name, isoTimeOf(now)));
      }),
    recordPresence: (presence) =>
      Effect.andThen(writes.recordPresence(presence), record(presence.identity, presence.lastSeenAt)),
  };
}

interface Recording<Store> {
  readonly store: Store;
  readonly record: RecordActivity;
}

function withActivity<Store extends ActivityWrites>({ record, store }: Recording<Store>): Store {
  return { ...store, ...recordingActivity(store, record) };
}

export { type RecordActivity, withActivity };
