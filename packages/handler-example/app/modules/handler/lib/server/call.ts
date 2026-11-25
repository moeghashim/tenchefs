import type { MessageId } from "@ai-hero/cookout/sdk";
import { Schema } from "effect";

const LOWEST_ID = 1;

function isThreadId(value: number): value is MessageId {
  return value >= LOWEST_ID;
}

const WebhookCommandCallSchema = Schema.Struct({
  callId: Schema.String,
  channel: Schema.String,
  command: Schema.String,
  data: Schema.Json,
  threadId: Schema.Int.pipe(Schema.refine(isThreadId, { identifier: "MessageId" })),
  token: Schema.String,
});

type WebhookCommandCall = typeof WebhookCommandCallSchema.Type;

export { type WebhookCommandCall, WebhookCommandCallSchema };
