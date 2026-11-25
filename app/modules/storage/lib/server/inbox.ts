import { Array as Arr, Option, Order, Predicate } from "effect";
import type { Channel, ChannelName } from "../../../channels/index.ts";
import type { InboxItem, InboxReason, MovedBackReadPosition, ReadPosition } from "../../../inbox/index.ts";
import type { Message, MessageId, ReadReceipt } from "../../../messages/index.ts";
import type { Effect } from "effect";
import type { IdentityName } from "../../../identities/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { StorageUnavailable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

type StoredInboxItem = Omit<InboxItem, "channel">;

type StoredHistoryItem = StoredInboxItem & { readonly read: boolean };

interface HistoryPageRequest {
  readonly before?: MessageId;
  readonly limit: number;
}

interface StoredHistoryPage {
  readonly items: readonly StoredHistoryItem[];
  readonly hasMore: boolean;
}

interface Scope {
  readonly channel: ChannelName;
  readonly thread: MessageId | null;
}

interface Moving {
  readonly message: Message;
  readonly current: MessageId | undefined;
}

interface AckedMessage {
  readonly readPosition: ReadPosition;
  readonly receipts: readonly ReadReceipt[];
}

interface AckedInbox {
  readonly readPositions: readonly ReadPosition[];
  readonly receipts: readonly ReadReceipt[];
}

interface InboxSection {
  readonly listInbox: (identity: IdentityName) => Fails<readonly StoredInboxItem[]>;
  readonly listInboxAfter: (identity: IdentityName, after: MessageId) => Fails<readonly StoredInboxItem[]>;
  readonly findInboxItem: (identity: IdentityName, id: MessageId) => Fails<StoredInboxItem | undefined>;
  readonly listInboxHistory: (identity: IdentityName, page: HistoryPageRequest) => Fails<StoredHistoryPage>;
  readonly ackMessage: (identity: IdentityName, id: MessageId, at: IsoTime) => Fails<AckedMessage | undefined>;
  readonly ackInbox: (identity: IdentityName, upTo: MessageId, at: IsoTime) => Fails<AckedInbox>;
  readonly listReadReceipts: (ids: readonly MessageId[]) => Fails<readonly ReadReceipt[]>;
  readonly moveReadPositionBack: (identity: IdentityName, id: MessageId) => Fails<MovedBackReadPosition | undefined>;
  readonly listReadPositions: (identity: IdentityName) => Fails<readonly ReadPosition[]>;
  readonly followThread: (identity: IdentityName, id: MessageId) => Fails<MessageId | undefined>;
  readonly unfollowThread: (identity: IdentityName, id: MessageId) => Fails<MessageId | undefined>;
  readonly subscribeChannel: (identity: IdentityName, channel: ChannelName) => Fails<boolean>;
  readonly unsubscribeChannel: (identity: IdentityName, channel: ChannelName) => Fails<boolean>;
  readonly listSubscribedChannels: (identity: IdentityName) => Fails<readonly Channel[]>;
}

function scopeOf(message: Message): Scope {
  if (message.kind === "reply") {
    return { channel: message.channel, thread: message.replyTo };
  }
  return { channel: message.channel, thread: null };
}

function movedTo({ current, message }: Moving): ReadPosition {
  if (Predicate.isNotUndefined(current) && current > message.id) {
    return { ...scopeOf(message), messageId: current };
  }
  return { ...scopeOf(message), messageId: message.id };
}

interface MovingBack {
  readonly message: Message;
  readonly current: MessageId | undefined;
  readonly previous: MessageId | undefined;
}

const byId: Order.Order<MessageId> = Order.Number;

function beforeIn(message: Message, previous: MessageId | undefined): Option.Option<MessageId> {
  return Option.orElse(Option.fromUndefinedOr(previous), () => Option.fromNullOr(scopeOf(message).thread));
}

function movedBackTo({ current, message, previous }: MovingBack): MovedBackReadPosition {
  const moved = Option.zipWith(Option.fromUndefinedOr(current), beforeIn(message, previous), Order.min(byId));
  return { ...scopeOf(message), messageId: Option.getOrNull(moved) };
}

function scopeKeyOf({ channel, thread }: Scope): string {
  return `${channel} ${String(thread)}`;
}

interface AckingUpTo {
  readonly items: readonly StoredInboxItem[];
  readonly upTo: MessageId;
}

function newestPerScope({ items, upTo }: AckingUpTo): readonly Message[] {
  const newest = new Map<string, Message>();
  for (const { message } of items) {
    if (message.id <= upTo) {
      newest.set(scopeKeyOf(scopeOf(message)), message);
    }
  }
  return Arr.sort(
    [...newest.values()],
    Order.mapInput(Order.Number, (message: Message) => message.id),
  );
}

function followersOf(message: Message): readonly IdentityName[] {
  return Arr.dedupe([message.author.name, ...message.mentions]);
}

function mentionsOwnAuthor(message: Message): boolean {
  return Predicate.isNotUndefined(message.scheduledMessage) && message.mentions.includes(message.author.name);
}

function reasonsIn(reasons: readonly InboxReason[]): readonly InboxReason[] {
  return Arr.sort(Arr.dedupe(reasons), Order.String);
}

export {
  type AckedInbox,
  type AckedMessage,
  type HistoryPageRequest,
  type InboxSection,
  type Scope,
  type StoredHistoryItem,
  type StoredHistoryPage,
  type StoredInboxItem,
  followersOf,
  mentionsOwnAuthor,
  movedBackTo,
  movedTo,
  newestPerScope,
  reasonsIn,
  scopeOf,
};
