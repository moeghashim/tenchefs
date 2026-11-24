import { Array as Arr, DateTime, Option, Predicate, Struct } from "effect";
import type {
  Closing,
  ListMessagesResponse,
  Message,
  MessageId,
  ReadReceipt,
  Reply,
  ThreadResponse,
  TopLevelMessage,
} from "../../../messages/index.ts";
import type { Duration, Effect } from "effect";
import { isMessageId, withNewestReply } from "../../../messages/index.ts";
import type { AttachmentsSection } from "./attachments.ts";
import type { ChannelName } from "../../../channels/index.ts";
import type { IdentityName } from "../../../identities/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { OpenThreadsSection } from "./open-threads.ts";
import type { SearchSection } from "./search.ts";
import type { StorageUnavailable } from "./errors.ts";
import { isoTimeOf } from "../../../time/server.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

type MessageContent = Omit<
  TopLevelMessage,
  "id" | "kind" | "latestReplyAt" | "latestReplyId" | "replyCount" | "repliers" | "closedAt" | "closedBy"
>;

type NewMessage = MessageContent & {
  readonly replyTo?: MessageId;
  readonly close?: true;
};

type AppendMessageResult =
  | {
      readonly status: "appended";
      readonly message: Message;
      readonly receipts: readonly ReadReceipt[];
      readonly threadChanged: TopLevelMessage | undefined;
    }
  | { readonly status: "channel_not_found" }
  | { readonly status: "reply_to_not_found" }
  | { readonly status: "reply_in_other_channel" };

type Placed = { readonly status: "top-level" } | { readonly status: "reply"; readonly parent: MessageId };

type Placement = Placed | { readonly status: "reply_to_not_found" } | { readonly status: "reply_in_other_channel" };

interface ChannelPageRequest {
  readonly before?: MessageId;
  readonly limit: number;
}

interface FoundReplyTo {
  readonly channel: ChannelName;
  readonly found: Message | undefined;
}

interface Placing {
  readonly id: MessageId;
  readonly message: NewMessage;
  readonly placement: Placed;
}

interface Mentioning {
  readonly known: ReadonlySet<IdentityName>;
  readonly message: NewMessage;
}

type Unreplied = Pick<TopLevelMessage, "kind" | "latestReplyAt" | "latestReplyId" | "replyCount" | "repliers">;

interface Counting {
  readonly parent: TopLevelMessage;
  readonly replies: readonly Reply[];
}

type StoredPage = Omit<ListMessagesResponse, "receipts">;

type StoredThread = Omit<ThreadResponse, "receipts">;

interface ThreadStateChange {
  readonly changed: boolean;
  readonly parent: TopLevelMessage;
}

interface MessagesSection extends OpenThreadsSection, SearchSection, AttachmentsSection {
  readonly appendMessage: (message: NewMessage) => Fails<AppendMessageResult>;
  readonly listChannelMessages: (channel: ChannelName, page: ChannelPageRequest) => Fails<StoredPage | undefined>;
  readonly getThread: (id: MessageId) => Fails<StoredThread | undefined>;
  readonly latestMessageId: Effect.Effect<MessageId | undefined, StorageUnavailable>;
  readonly closeThread: (id: MessageId, closing: Closing) => Fails<ThreadStateChange | undefined>;
  readonly reopenThread: (id: MessageId, reopenedAt: IsoTime) => Fails<ThreadStateChange | undefined>;
}

const NO_REPLIES = 0;

function asMessageId(value: number): MessageId {
  return Option.getOrThrow(Option.liftPredicate(value, isMessageId));
}

function threadIdOf(message: Message): MessageId {
  if (message.kind === "reply") {
    return message.replyTo;
  }
  return message.id;
}

function placeIn({ channel, found }: FoundReplyTo): Placement {
  if (Predicate.isUndefined(found)) {
    return { status: "reply_to_not_found" };
  }
  if (found.channel !== channel) {
    return { status: "reply_in_other_channel" };
  }
  return { parent: threadIdOf(found), status: "reply" };
}

function isPlaced(placement: Placement): placement is Placed {
  return placement.status === "top-level" || placement.status === "reply";
}

function unreplied<Content extends MessageContent>(content: Content): Content & Unreplied {
  return {
    ...content,
    kind: "top-level",
    latestReplyAt: null,
    latestReplyId: null,
    repliers: [],
    replyCount: NO_REPLIES,
  };
}

function placed({ id, message, placement }: Placing): Message {
  const content = Struct.omit(message, ["close"]);
  if (placement.status === "reply") {
    return { ...content, id, kind: "reply", replyTo: placement.parent };
  }
  return { ...unreplied(content), id };
}

function closingBy(reply: Reply): Closing {
  return { closedAt: reply.createdAt, closedBy: reply.author.name };
}

interface Stamping {
  readonly message: NewMessage;
  readonly latest: Option.Option<IsoTime>;
}

const STAMP_GAP: Duration.Input = "1 millis";

function justAfter(time: IsoTime): IsoTime {
  return isoTimeOf(DateTime.addDuration(DateTime.makeUnsafe(time), STAMP_GAP));
}

function stampedAfter({ latest, message }: Stamping): NewMessage {
  return Option.match(
    Option.filter(Option.map(latest, justAfter), (time) => time > message.createdAt),
    {
      onNone: () => message,
      onSome: (createdAt) => ({ ...message, createdAt }),
    },
  );
}

function withKnownMentions({ known, message }: Mentioning): NewMessage {
  return { ...message, mentions: Arr.filter(message.mentions, (name) => known.has(name)) };
}

function closingOf({ closedAt, closedBy }: TopLevelMessage): Partial<Closing> {
  if (Predicate.isUndefined(closedAt) || Predicate.isUndefined(closedBy)) {
    return {};
  }
  return { closedAt, closedBy };
}

function counted({ parent, replies }: Counting): TopLevelMessage {
  const fold = Arr.reduce(replies, unreplied(parent), (counting, reply) =>
    withNewestReply({ parent: counting, reply }),
  );
  return { ...fold, ...closingOf(parent) };
}

export {
  type AppendMessageResult,
  type ChannelPageRequest,
  type Mentioning,
  type MessagesSection,
  type NewMessage,
  type Placement,
  type StoredPage,
  type StoredThread,
  type ThreadStateChange,
  asMessageId,
  closingBy,
  counted,
  isPlaced,
  placeIn,
  placed,
  stampedAfter,
  threadIdOf,
  withKnownMentions,
};

export { attachmentIn } from "./attachments.ts";
