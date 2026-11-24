import { AuthorSchema, MessageIdSchema, ScheduledMessageIdSchema, TextSchema } from "../../../messages/server.ts";
import type {
  ListScheduledMessagesResponse,
  ScheduledMessage,
  ScheduledMessagePreviewResponse,
  ScheduledMessageResponse,
  ScheduledMessageRun,
} from "../../index.ts";
import { scheduledMessagePauseReasons, scheduledMessageStatuses, scheduledRunOutcomes } from "../../index.ts";
import { ChannelNameSchema } from "../../../channels/server.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import { Schema } from "effect";
import { matchesWire } from "../../../http/index.ts";

const ScheduledMessageRunSchema = matchesWire<ScheduledMessageRun>()(
  Schema.Struct({
    due: IsoTimeSchema,
    messageId: Schema.optionalKey(MessageIdSchema),
    outcome: Schema.Literals(scheduledRunOutcomes),
  }),
);

const PauseReasonSchema = Schema.Literals(scheduledMessagePauseReasons);

const ScheduledMessageSchema = matchesWire<ScheduledMessage>()(
  Schema.Struct({
    at: Schema.optionalKey(IsoTimeSchema),
    channel: ChannelNameSchema,
    createdAt: IsoTimeSchema,
    creator: AuthorSchema,
    cron: Schema.optionalKey(Schema.String),
    id: ScheduledMessageIdSchema,
    lastRun: Schema.optionalKey(ScheduledMessageRunSchema),
    nextRuns: Schema.Array(IsoTimeSchema),
    pausedBecause: Schema.optionalKey(PauseReasonSchema),
    status: Schema.Literals(scheduledMessageStatuses),
    text: Schema.String,
    timeZone: Schema.String,
    updatedAt: IsoTimeSchema,
  }),
);

export const CreateScheduledMessageRequestSchema = Schema.Struct({
  at: Schema.optionalKey(Schema.String),
  channel: Schema.String,
  cron: Schema.optionalKey(Schema.String),
  text: TextSchema,
  timeZone: Schema.String,
});

export const EditScheduledMessageRequestSchema = Schema.Struct({
  at: Schema.optionalKey(Schema.String),
  cron: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(TextSchema),
  timeZone: Schema.optionalKey(Schema.String),
});

export const PreviewScheduledMessageQuerySchema = Schema.Struct({
  at: Schema.optionalKey(Schema.String),
  cron: Schema.optionalKey(Schema.String),
  timeZone: Schema.String,
});

export const ScheduledMessagePreviewResponseSchema = matchesWire<ScheduledMessagePreviewResponse>()(
  Schema.Struct({ nextRuns: Schema.Array(IsoTimeSchema) }),
);

export const ListScheduledMessagesQuerySchema = Schema.Struct({ channel: Schema.optionalKey(Schema.String) });

export const ScheduledMessageResponseSchema = matchesWire<ScheduledMessageResponse>()(
  Schema.Struct({ scheduledMessage: ScheduledMessageSchema }),
);

export const ListScheduledMessagesResponseSchema = matchesWire<ListScheduledMessagesResponse>()(
  Schema.Struct({ scheduledMessages: Schema.Array(ScheduledMessageSchema) }),
);
