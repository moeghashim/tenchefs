import type {
  AgentJoinRequestsEvent,
  AgentSessionEvent,
  ChannelDeletedEvent,
  ChannelEvent,
  CleanCloseResponse,
  CommandEvent,
  ConnectedEvent,
  DeactivatedQuietAgentEvent,
  DeactivationOfferEvent,
  IdentityDeletedEvent,
  IdentityEvent,
  InboxItemEvent,
  MessageDeletedEvent,
  MessageEvent,
  NudgeEvent,
  NudgeReadEvent,
  OfflineAlertEvent,
  PresenceEvent,
  ReactionEvent,
  ReadPositionEvent,
  ReadPositionMovedBackEvent,
  ReadReceiptEvent,
  SubscriptionEvent,
  ThreadEvent,
} from "../../index.ts";
import { ChannelNameSchema, ChannelSchema } from "../../../channels/server.ts";
import {
  DeactivatedQuietAgentSchema,
  DeactivationOfferSchema,
  InboxAgentJoinRequestSchema,
  InboxItemSchema,
  MovedBackReadPositionSchema,
  NudgeIdSchema,
  NudgeSchema,
  OfflineAlertSchema,
  ReadPositionSchema,
  SubscriptionResponseSchema,
} from "../../../inbox/server.ts";
import { IdentityNameSchema, IdentitySchema } from "../../../identities/server.ts";
import {
  MessageIdSchema,
  MessageSchema,
  ReactionCountSchema,
  ReadReceiptSchema,
  TopLevelMessageSchema,
} from "../../../messages/server.ts";
import { isLiveConnectionId, presenceName } from "../../../presence/index.ts";
import { PresenceSchema } from "../../../presence/server.ts";
import { RegisteredWebhookCommandSchema } from "../../../webhook-commands/server.ts";
import { Schema } from "effect";
import { matchesWire } from "../../../http/index.ts";

const LiveConnectionIdSchema = Schema.Int.pipe(Schema.refine(isLiveConnectionId, { identifier: "LiveConnectionId" }));

export const InboxItemEventSchema = matchesWire<InboxItemEvent>()(
  Schema.Struct({ item: InboxItemSchema, type: Schema.Literal("inbox-item") }),
);

export const NudgeEventSchema = matchesWire<NudgeEvent>()(
  Schema.Struct({ nudge: NudgeSchema, type: Schema.Literal("nudge") }),
);

export const NudgeReadEventSchema = matchesWire<NudgeReadEvent>()(
  Schema.Struct({ nudgeIds: Schema.Array(NudgeIdSchema), type: Schema.Literal("nudge-read") }),
);

export const DeactivatedQuietAgentEventSchema = matchesWire<DeactivatedQuietAgentEvent>()(
  Schema.Struct({
    deactivatedQuietAgent: DeactivatedQuietAgentSchema,
    type: Schema.Literal("deactivated-quiet-agent"),
  }),
);

export const DeactivationOfferEventSchema = matchesWire<DeactivationOfferEvent>()(
  Schema.Struct({ deactivationOffer: DeactivationOfferSchema, type: Schema.Literal("deactivation-offer") }),
);

export const AgentJoinRequestsEventSchema = matchesWire<AgentJoinRequestsEvent>()(
  Schema.Struct({
    agentJoinRequests: Schema.Array(InboxAgentJoinRequestSchema),
    type: Schema.Literal("agent-join-requests"),
  }),
);

export const ReadPositionEventSchema = matchesWire<ReadPositionEvent>()(
  Schema.Struct({ readPosition: ReadPositionSchema, type: Schema.Literal("read-position") }),
);

export const ReadPositionMovedBackEventSchema = matchesWire<ReadPositionMovedBackEvent>()(
  Schema.Struct({ readPosition: MovedBackReadPositionSchema, type: Schema.Literal("read-position-moved-back") }),
);

export const MessageEventSchema = matchesWire<MessageEvent>()(
  Schema.Struct({ message: MessageSchema, type: Schema.Literal("message") }),
);

export const ThreadEventSchema = matchesWire<ThreadEvent>()(
  Schema.Struct({ parent: TopLevelMessageSchema, type: Schema.Literal("thread") }),
);

export const IdentityEventSchema = matchesWire<IdentityEvent>()(
  Schema.Struct({ identity: IdentitySchema, type: Schema.Literal("identity") }),
);

export const ReadReceiptEventSchema = matchesWire<ReadReceiptEvent>()(
  Schema.Struct({ receipt: ReadReceiptSchema, type: Schema.Literal("read-receipt") }),
);

export const ReactionEventSchema = matchesWire<ReactionEvent>()(
  Schema.Struct({
    channel: ChannelNameSchema,
    messageId: MessageIdSchema,
    reactions: Schema.Array(ReactionCountSchema),
    type: Schema.Literal("reaction"),
  }),
);

export const ChannelEventSchema = matchesWire<ChannelEvent>()(
  Schema.Struct({ channel: ChannelSchema, type: Schema.Literal("channel") }),
);

export const ChannelDeletedEventSchema = matchesWire<ChannelDeletedEvent>()(
  Schema.Struct({ channel: ChannelSchema, type: Schema.Literal("channel-deleted") }),
);

export const MessageDeletedEventSchema = matchesWire<MessageDeletedEvent>()(
  Schema.Struct({
    message: MessageSchema,
    parent: Schema.optionalKey(TopLevelMessageSchema),
    type: Schema.Literal("message-deleted"),
  }),
);

export const IdentityDeletedEventSchema = matchesWire<IdentityDeletedEvent>()(
  Schema.Struct({ identity: IdentitySchema, type: Schema.Literal("identity-deleted") }),
);

export const CommandEventSchema = matchesWire<CommandEvent>()(
  Schema.Struct({ command: RegisteredWebhookCommandSchema, type: Schema.Literal("command") }),
);

export const AgentSessionEventSchema = matchesWire<AgentSessionEvent>()(
  Schema.Struct({ agent: IdentityNameSchema, type: Schema.Literal("agent-session") }),
);

export const SubscriptionEventSchema = matchesWire<SubscriptionEvent>()(
  Schema.Struct({ subscription: SubscriptionResponseSchema, type: Schema.Literal("subscription") }),
);

export const ConnectedEventSchema = matchesWire<ConnectedEvent>()(
  Schema.Struct({
    connectionId: Schema.optionalKey(LiveConnectionIdSchema),
    latestMessageId: Schema.NullOr(MessageIdSchema),
    type: Schema.Literal("connected"),
  }),
);

export const CleanCloseResponseSchema = matchesWire<CleanCloseResponse>()(
  Schema.Struct({ closed: Schema.Literal(true) }),
);

export const PresenceEventSchema = matchesWire<PresenceEvent>()(
  Schema.Struct({ presence: PresenceSchema, type: Schema.Literal(presenceName) }),
);

export const OfflineAlertEventSchema = matchesWire<OfflineAlertEvent>()(
  Schema.Struct({ alert: OfflineAlertSchema, type: Schema.Literal("offline-alert") }),
);

export { PresenceResponseSchema, WakeRunResponseSchema } from "../../../presence/server.ts";
