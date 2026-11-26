import type {
  Author,
  ListMessagesResponse,
  MessageResponse,
  Reaction,
  ReactionCount,
  ReactionsResponse,
  ReadReceipt,
  Reply,
  ThreadResponse,
  TopLevelMessage,
  TopLevelMessageResponse,
} from "../../index.ts";
import {
  attachmentIdPattern,
  imageContentTypes,
  isAttachmentId,
  opaqueContentType,
} from "../../../attachments/index.ts";
import { channelNamePattern, isChannelName } from "../../../channels/index.ts";
import {
  harnessPattern,
  identityNamePattern,
  isHarness,
  isIdentityName,
  isOwner,
  plainNamePattern,
} from "../../../identities/index.ts";
import { isMessageId, messageTextLength, pageSize, reactionNames, shownRepliers } from "../../index.ts";
import type { Attachment } from "../../../attachments/index.ts";
import type { DeletedMessageResponse } from "../../client.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import { Schema } from "effect";
import { isScheduledMessageId } from "../../../scheduled-messages/index.ts";
import { matchesWire } from "../../../http/index.ts";

const NO_REPLIES = 0;
const LOWEST_ID = 1;

const channelNameRule = Schema.isPattern(channelNamePattern).abort();
const ChannelNameSchema = Schema.String.check(channelNameRule).pipe(
  Schema.refine(isChannelName, { identifier: "ChannelName" }),
);

const identityNameRule = Schema.isPattern(identityNamePattern).abort();
const IdentityNameSchema = Schema.String.check(identityNameRule).pipe(
  Schema.refine(isIdentityName, { identifier: "IdentityName" }),
);

const ownerRule = Schema.isPattern(plainNamePattern).abort();
const OwnerSchema = Schema.String.check(ownerRule).pipe(Schema.refine(isOwner, { identifier: "Owner" }));

const positive = Schema.isGreaterThanOrEqualTo(LOWEST_ID).abort();
const MessageIdSchema = Schema.Int.check(positive).pipe(Schema.refine(isMessageId, { identifier: "MessageId" }));

const ScheduledMessageIdSchema = Schema.Int.check(positive).pipe(
  Schema.refine(isScheduledMessageId, { identifier: "ScheduledMessageId" }),
);

const ScheduledMessageMarkerSchema = Schema.Struct({ deleted: Schema.Boolean, id: ScheduledMessageIdSchema });

const textRule = Schema.isBetweenLength(messageTextLength.minimum, messageTextLength.maximum);
const TextSchema = Schema.String.check(textRule);
const ShownTextSchema = Schema.String.check(Schema.isMaxLength(messageTextLength.maximum));

const AttachmentIdSchema = Schema.String.check(Schema.isPattern(attachmentIdPattern)).pipe(
  Schema.refine(isAttachmentId, { identifier: "AttachmentId" }),
);
const AttachmentContentTypeSchema = Schema.Literals([...imageContentTypes, opaqueContentType]);
const AttachmentSizeSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(LOWEST_ID));
const AttachmentPixelsSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(LOWEST_ID));

const AttachmentSchema = matchesWire<Attachment>()(
  Schema.Struct({
    contentType: AttachmentContentTypeSchema,
    height: Schema.optionalKey(AttachmentPixelsSchema),
    id: AttachmentIdSchema,
    image: Schema.Boolean,
    name: Schema.String,
    size: AttachmentSizeSchema,
    width: Schema.optionalKey(AttachmentPixelsSchema),
  }),
);

const AuthorSchema = matchesWire<Author>()(
  Schema.Struct({ name: IdentityNameSchema, owner: Schema.optionalKey(OwnerSchema) }),
);

const harnessRule = Schema.isPattern(harnessPattern).abort();
const HarnessSchema = Schema.String.check(harnessRule).pipe(Schema.refine(isHarness, { identifier: "Harness" }));

const ReactionNameSchema = Schema.Literals(reactionNames);

const ReactorCountSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(LOWEST_ID));

const ReactionCountSchema = matchesWire<ReactionCount>()(
  Schema.Struct({
    by: Schema.Array(IdentityNameSchema),
    count: ReactorCountSchema,
    reaction: ReactionNameSchema,
  }),
);

const messageFields = {
  attachments: Schema.optionalKey(Schema.Array(AttachmentSchema)),
  author: AuthorSchema,
  channel: ChannelNameSchema,
  createdAt: IsoTimeSchema,
  data: Schema.optionalKey(Schema.Json),
  harness: Schema.optionalKey(HarnessSchema),
  id: MessageIdSchema,
  mentions: Schema.Array(IdentityNameSchema),
  reactions: Schema.optionalKey(Schema.Array(ReactionCountSchema)),
  scheduledMessage: Schema.optionalKey(ScheduledMessageMarkerSchema),
  text: ShownTextSchema,
};

const ReplyCountSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(NO_REPLIES));

const RepliersSchema = Schema.Array(AuthorSchema).check(Schema.isMaxLength(shownRepliers));

const TopLevelMessageSchema = matchesWire<TopLevelMessage>()(
  Schema.Struct({
    ...messageFields,
    closedAt: Schema.optionalKey(IsoTimeSchema),
    closedBy: Schema.optionalKey(IdentityNameSchema),
    kind: Schema.Literal("top-level"),
    latestReplyAt: Schema.NullOr(IsoTimeSchema),
    latestReplyId: Schema.NullOr(MessageIdSchema),
    repliers: RepliersSchema,
    replyCount: ReplyCountSchema,
  }),
);

const ReplySchema = matchesWire<Reply>()(
  Schema.Struct({ ...messageFields, kind: Schema.Literal("reply"), replyTo: MessageIdSchema }),
);

const MessageSchema = Schema.Union([TopLevelMessageSchema, ReplySchema]);

const pageLimit = Schema.isBetween({ maximum: pageSize.maximum, minimum: pageSize.minimum });
const LimitSchema = Schema.Int.check(pageLimit);
const decodesToLimit = Schema.decodeTo(LimitSchema);
const decodesToMessageId = Schema.decodeTo(MessageIdSchema);

const MessageIdFromString = Schema.FiniteFromString.pipe(decodesToMessageId);

export const PostMessageRequestSchema = Schema.Struct({
  channel: ChannelNameSchema,
  close: Schema.optionalKey(Schema.Literal(true)),
  data: Schema.optionalKey(Schema.Json),
  replyTo: Schema.optionalKey(MessageIdSchema),
  seen: Schema.optionalKey(MessageIdSchema),
  text: TextSchema,
});

export const PostWithAttachmentsRequestSchema = Schema.Struct({
  ...PostMessageRequestSchema.fields,
  text: Schema.optionalKey(ShownTextSchema),
});

export const ListMessagesQuerySchema = Schema.Struct({
  before: Schema.optionalKey(MessageIdFromString),
  limit: Schema.optionalKey(Schema.FiniteFromString.pipe(decodesToLimit)),
});

export const MessageResponseSchema = matchesWire<MessageResponse>()(
  Schema.Struct({
    message: MessageSchema,
    unknownMentions: Schema.Array(Schema.String),
  }),
);

export const ReadReceiptSchema = matchesWire<ReadReceipt>()(
  Schema.Struct({
    identity: IdentityNameSchema,
    messageId: MessageIdSchema,
    seen: Schema.Boolean,
    seenAt: Schema.optionalKey(IsoTimeSchema),
  }),
);

export const ListMessagesResponseSchema = matchesWire<ListMessagesResponse>()(
  Schema.Struct({
    hasMore: Schema.Boolean,
    messages: Schema.Array(TopLevelMessageSchema),
    receipts: Schema.Array(ReadReceiptSchema),
  }),
);

export const ThreadResponseSchema = matchesWire<ThreadResponse>()(
  Schema.Struct({
    parent: TopLevelMessageSchema,
    receipts: Schema.Array(ReadReceiptSchema),
    replies: Schema.Array(ReplySchema),
  }),
);

export const ReactionSchema = matchesWire<Reaction>()(
  Schema.Struct({
    identity: IdentityNameSchema,
    messageId: MessageIdSchema,
    reactedAt: IsoTimeSchema,
    reaction: ReactionNameSchema,
  }),
);

export const ReactionsResponseSchema = matchesWire<ReactionsResponse>()(
  Schema.Struct({
    channel: ChannelNameSchema,
    messageId: MessageIdSchema,
    reactions: Schema.Array(ReactionCountSchema),
  }),
);

export const TopLevelMessageResponseSchema = matchesWire<TopLevelMessageResponse>()(
  Schema.Struct({ message: TopLevelMessageSchema }),
);

export const DeletedMessageResponseSchema = matchesWire<DeletedMessageResponse>()(
  Schema.Struct({ message: MessageSchema }),
);

export {
  AuthorSchema,
  MessageIdSchema,
  MessageSchema,
  ReactionCountSchema,
  ScheduledMessageIdSchema,
  TextSchema,
  TopLevelMessageSchema,
};
