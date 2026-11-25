import type {
  AckAllRequest,
  AckAllResponse,
  AckResponse,
  DeactivatedQuietAgent,
  DeactivatedQuietAgentResponse,
  DeactivationOffer,
  DeactivationOfferResponse,
  FollowResponse,
  InboxAgentJoinRequest,
  InboxHistoryItem,
  InboxHistoryNudge,
  InboxHistoryResponse,
  InboxItem,
  InboxResponse,
  MarkUnreadResponse,
  MovedBackReadPosition,
  Nudge,
  NudgeResponse,
  OfflineAlert,
  OfflineAlertResponse,
  ReadPosition,
  ReadPositionsResponse,
  SubscriptionResponse,
} from "../../index.ts";
import { ChannelNameSchema, ChannelSchema } from "../../../channels/server.ts";
import { IdentityNameSchema, IdentitySchema } from "../../../identities/server.ts";
import { MessageIdSchema, MessageSchema, ReactionSchema, TopLevelMessageSchema } from "../../../messages/server.ts";
import { inboxReasons, isDeactivatedQuietAgentId, isDeactivationOfferId, isNudgeId, nudgeKinds } from "../../index.ts";
import { isOfflineAlertId, offlineReasons } from "../../../presence/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import { Schema } from "effect";
import type { TriggerFailure } from "../../../triggers/index.ts";
import { matchesWire } from "../../../http/index.ts";

const InboxReasonSchema = Schema.Literals(inboxReasons);

const OfflineAlertIdSchema = Schema.Int.pipe(Schema.refine(isOfflineAlertId, { identifier: "OfflineAlertId" }));

const inboxItemFields = {
  channel: ChannelSchema,
  message: MessageSchema,
  newReactions: Schema.optionalKey(Schema.Array(ReactionSchema)),
  parent: TopLevelMessageSchema,
  reasons: Schema.Array(InboxReasonSchema),
};

const NudgeIdSchema = Schema.Int.pipe(Schema.refine(isNudgeId, { identifier: "NudgeId" }));

const nudgeFields = {
  channel: ChannelSchema,
  id: NudgeIdSchema,
  kind: Schema.Literals(nudgeKinds),
  parent: TopLevelMessageSchema,
  raisedAt: IsoTimeSchema,
  text: Schema.String,
};

const NudgeSchema = matchesWire<Nudge>()(Schema.Struct(nudgeFields));

const InboxHistoryNudgeSchema = matchesWire<InboxHistoryNudge>()(
  Schema.Struct({ ...nudgeFields, read: Schema.Boolean }),
);

const NudgeResponseSchema = matchesWire<NudgeResponse>()(Schema.Struct({ nudge: InboxHistoryNudgeSchema }));

const DeactivationOfferIdSchema = Schema.Int.pipe(
  Schema.refine(isDeactivationOfferId, { identifier: "DeactivationOfferId" }),
);

const DeactivationOfferSchema = matchesWire<DeactivationOffer>()(
  Schema.Struct({
    cleared: Schema.Boolean,
    id: DeactivationOfferIdSchema,
    identity: IdentitySchema,
    quietDays: Schema.Int,
    raisedAt: IsoTimeSchema,
    text: Schema.String,
  }),
);

const DeactivationOfferResponseSchema = matchesWire<DeactivationOfferResponse>()(
  Schema.Struct({ deactivationOffer: DeactivationOfferSchema }),
);

const DeactivatedQuietAgentIdSchema = Schema.Int.pipe(
  Schema.refine(isDeactivatedQuietAgentId, { identifier: "DeactivatedQuietAgentId" }),
);

const DeactivatedQuietAgentSchema = matchesWire<DeactivatedQuietAgent>()(
  Schema.Struct({
    deactivatedAt: IsoTimeSchema,
    id: DeactivatedQuietAgentIdSchema,
    identity: IdentitySchema,
    read: Schema.Boolean,
    text: Schema.String,
  }),
);

const DeactivatedQuietAgentResponseSchema = matchesWire<DeactivatedQuietAgentResponse>()(
  Schema.Struct({ deactivatedQuietAgent: DeactivatedQuietAgentSchema }),
);

const InboxAgentJoinRequestSchema = matchesWire<InboxAgentJoinRequest>()(
  Schema.Struct({
    agent: IdentitySchema,
    createdAt: IsoTimeSchema,
    expiresAt: IsoTimeSchema,
    host: Schema.String,
    liveSessionExpiresAt: Schema.optionalKey(IsoTimeSchema),
    text: Schema.String,
    userCode: Schema.String,
  }),
);

const InboxHistoryItemSchema = matchesWire<InboxHistoryItem>()(
  Schema.Struct({ ...inboxItemFields, read: Schema.Boolean }),
);

const TriggerFailureSchema = matchesWire<TriggerFailure>()(
  Schema.Struct({
    error: Schema.optionalKey(Schema.String),
    message: MessageIdSchema,
    status: Schema.optionalKey(Schema.Int),
  }),
);

export const OfflineAlertSchema = matchesWire<OfflineAlert>()(
  Schema.Struct({
    agent: IdentityNameSchema,
    backOnlineAt: Schema.optionalKey(IsoTimeSchema),
    id: OfflineAlertIdSchema,
    offlineReason: Schema.Literals(offlineReasons),
    raisedAt: IsoTimeSchema,
    read: Schema.Boolean,
    trigger: Schema.optionalKey(TriggerFailureSchema),
  }),
);

export const OfflineAlertResponseSchema = matchesWire<OfflineAlertResponse>()(
  Schema.Struct({ alert: OfflineAlertSchema }),
);

export const ReadPositionSchema = matchesWire<ReadPosition>()(
  Schema.Struct({ channel: ChannelNameSchema, messageId: MessageIdSchema, thread: Schema.NullOr(MessageIdSchema) }),
);

export const MovedBackReadPositionSchema = matchesWire<MovedBackReadPosition>()(
  Schema.Struct({
    channel: ChannelNameSchema,
    messageId: Schema.NullOr(MessageIdSchema),
    thread: Schema.NullOr(MessageIdSchema),
  }),
);

export const MarkUnreadRequestSchema = Schema.Struct({ messageId: MessageIdSchema });

export const MarkUnreadResponseSchema = matchesWire<MarkUnreadResponse>()(
  Schema.Struct({ readPosition: MovedBackReadPositionSchema }),
);

export const ReadPositionsResponseSchema = matchesWire<ReadPositionsResponse>()(
  Schema.Struct({ readPositions: Schema.Array(ReadPositionSchema) }),
);

export const InboxItemSchema = matchesWire<InboxItem>()(Schema.Struct(inboxItemFields));

export const InboxHistoryResponseSchema = matchesWire<InboxHistoryResponse>()(
  Schema.Struct({
    alerts: Schema.Array(OfflineAlertSchema),
    deactivatedQuietAgents: Schema.Array(DeactivatedQuietAgentSchema),
    deactivationOffers: Schema.Array(DeactivationOfferSchema),
    hasMore: Schema.Boolean,
    items: Schema.Array(InboxHistoryItemSchema),
    nudges: Schema.Array(InboxHistoryNudgeSchema),
  }),
);

export const AckRequestSchema = Schema.Struct({ messageId: MessageIdSchema });

export const AckAllRequestSchema = matchesWire<AckAllRequest>()(
  Schema.Struct({
    alertsUpTo: Schema.optionalKey(OfflineAlertIdSchema),
    deactivatedQuietAgentsUpTo: Schema.optionalKey(DeactivatedQuietAgentIdSchema),
    deactivationOffersUpTo: Schema.optionalKey(DeactivationOfferIdSchema),
    nudgesUpTo: Schema.optionalKey(NudgeIdSchema),
    upTo: Schema.optionalKey(MessageIdSchema),
  }),
);

export const AckAllResponseSchema = matchesWire<AckAllResponse>()(
  Schema.Struct({ alerts: Schema.Array(OfflineAlertSchema), readPositions: Schema.Array(ReadPositionSchema) }),
);

export const InboxResponseSchema = matchesWire<InboxResponse>()(
  Schema.Struct({
    agentJoinRequests: Schema.Array(InboxAgentJoinRequestSchema),
    alerts: Schema.Array(OfflineAlertSchema),
    deactivatedQuietAgents: Schema.Array(DeactivatedQuietAgentSchema),
    deactivationOffers: Schema.Array(DeactivationOfferSchema),
    items: Schema.Array(InboxItemSchema),
    nudges: Schema.Array(NudgeSchema),
  }),
);

export const AckResponseSchema = matchesWire<AckResponse>()(Schema.Struct({ readPosition: ReadPositionSchema }));

export const FollowResponseSchema = matchesWire<FollowResponse>()(
  Schema.Struct({ following: Schema.Boolean, thread: MessageIdSchema }),
);

export const SubscriptionResponseSchema = matchesWire<SubscriptionResponse>()(
  Schema.Struct({ channel: ChannelNameSchema, subscribed: Schema.Boolean }),
);

export { PageQuerySchema as InboxHistoryQuerySchema } from "../../../messages/server.ts";

export {
  DeactivatedQuietAgentResponseSchema,
  DeactivatedQuietAgentSchema,
  DeactivationOfferResponseSchema,
  DeactivationOfferSchema,
  InboxAgentJoinRequestSchema,
  NudgeIdSchema,
  NudgeResponseSchema,
  NudgeSchema,
};
