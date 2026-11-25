import type { JsonValue, MessageId } from "../../../messages/index.ts";
import type { ChannelName } from "../../../channels/index.ts";
import { Effect } from "effect";
import { Messages } from "../../../messages/server.ts";
import { Storage } from "../../../storage/server.ts";
import type { StoredWebhookCommand } from "../../../storage/server.ts";

interface Call {
  readonly stored: StoredWebhookCommand;
  readonly data: JsonValue;
  readonly channel: ChannelName;
  readonly threadId: MessageId;
}

type FailureReplyNeeds = Messages | Storage;

interface FailedDelivery {
  readonly call: Call;
  readonly retries: number;
}

function failureReply({ call, retries }: FailedDelivery): Effect.Effect<void, never, FailureReplyNeeds> {
  const { name } = call.stored.command;
  return Effect.gen(function* postFailureReply() {
    const messages = yield* Messages;
    const storage = yield* Storage;
    const handler = yield* Effect.flatMap(
      storage.findIdentityByName(call.stored.command.handler),
      Effect.fromNullishOr,
    );
    yield* messages.post(handler, {
      channel: call.channel,
      replyTo: call.threadId,
      text: `The delivery of /${name} to its handler failed after ${retries} retries.`,
    });
  }).pipe(Effect.ignore({ log: "Warn", message: `The failure reply in thread ${call.threadId} could not be posted.` }));
}

export { type Call, type FailureReplyNeeds, failureReply };
