/**
 * Messages and threads on the wire, shared by the server, the SDK and the web: the `MessageId` brand and its check,
 * `Message` as a union tagged by `kind`, the requests and answers of posting, threads and channel pages, their paths,
 * and the error codes they refuse with.
 */
import type { Harness, IdentityName, Owner } from "../identities/index.ts";
import type { ChannelName } from "../channels/index.ts";
import type { IsoTime } from "../time/index.ts";
import type { WithAttachments } from "../attachments/index.ts";

declare const brand: unique symbol;

const LOWEST_ID = 1;
const FIRST = 0;
const ONE_MORE = 1;

/** A message's ID: a positive whole number, from one increasing sequence across the server, so IDs order messages. */
export type MessageId = number & { readonly [brand]: "MessageId" };

/**
 * Whether `value` is a positive whole number; if so, it is a `MessageId`.
 * @param value The number to check.
 * @returns Whether `value` is a `MessageId`.
 */
export function isMessageId(value: number): value is MessageId {
  return Number.isSafeInteger(value) && value >= LOWEST_ID;
}

/** The text rule, in UTF-16 code units as `String.length` counts them. */
export const messageTextLength = { maximum: 40_000, minimum: 1 } as const;

/** Any JSON value. */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** The Scheduled message that posted a message, and whether it has since been deleted (read now, not when posted). */
export interface ScheduledMessageMarker {
  readonly id: number & { readonly [brand]: "ScheduledMessageId" };
  readonly deleted: boolean;
}

/** Who posted a message, as they were when they posted it, so it survives the identity being deleted. */
export interface Author {
  readonly name: IdentityName;
  readonly owner?: Owner;
}

/** The fields every message has, top-level or reply. */
export interface MessageFields extends WithAttachments {
  readonly id: MessageId;
  readonly channel: ChannelName;
  readonly author: Author;
  /** Plain text, up to 40,000 characters. Empty only on a message posted with attachments and no text. */
  readonly text: string;
  /** Any JSON value, for commands and agents to read. Absent when none was sent. */
  readonly data?: JsonValue;
  /** Names of the identities the text mentions. */
  readonly mentions: readonly IdentityName[];
  /** The harness the message was posted from, such as `claude-code`. Absent when none was named. */
  readonly harness?: Harness;
  readonly scheduledMessage?: ScheduledMessageMarker;
  readonly createdAt: IsoTime;
  /**
   * The reactions on the message, one count for each reaction anyone has left, in `reactionNames` order, on the
   * messages of channel pages, threads and the inbox. Absent while the message has none, and on live `message` events.
   */
  readonly reactions?: readonly ReactionCount[];
}

/** A message posted straight into a channel. It may have a thread of replies. */
export interface TopLevelMessage extends MessageFields {
  readonly kind: "top-level";
  readonly replyCount: number;
  /** The newest reply in its thread, or `null` if it has none. */
  readonly latestReplyId: MessageId | null;
  /** When the newest reply in its thread was posted, or `null` if it has none. */
  readonly latestReplyAt: IsoTime | null;
  /**
   * The authors of its thread's replies, once each by name, the latest replier first: at most `shownRepliers`.
   * Each is the author as stored on their latest reply, so a deleted replier still shows.
   */
  readonly repliers: readonly Author[];
  /** When its thread was closed. Present only while the thread is closed; `closedBy` is present with it. */
  readonly closedAt?: IsoTime;
  /** Who closed its thread. Present only while the thread is closed; `closedAt` is present with it. */
  readonly closedBy?: IdentityName;
}

/** Who closed a thread and when, as its top-level message carries it while the thread is closed. */
export type Closing = Required<Pick<TopLevelMessage, "closedAt" | "closedBy">>;

/**
 * A top-level message with its thread open: no `closedAt` and no `closedBy`.
 * @param parent The top-level message.
 * @returns The same message, open.
 */
export function reopened(parent: TopLevelMessage): TopLevelMessage {
  const { closedAt: _closedAt, closedBy: _closedBy, ...open } = parent;
  return open;
}

/** A top-level message and the newest reply in its thread. */
export interface Replying {
  readonly parent: TopLevelMessage;
  readonly reply: Reply;
}

/** How many repliers a top-level message names. */
export const shownRepliers = 4;

/**
 * A top-level message as it is once `reply`, the newest reply in its thread, is posted: one more reply, `reply` as its
 * latest, `reply`'s author as its latest replier, and its thread open, since a reply reopens a closed thread.
 * @param replying The top-level message and its newest reply.
 * @param replying.parent The top-level message.
 * @param replying.reply The newest reply in its thread.
 * @returns The top-level message counting `reply`.
 */
export function withNewestReply({ parent, reply }: Replying): TopLevelMessage {
  const others = parent.repliers.filter((replier) => replier.name !== reply.author.name);
  return {
    ...reopened(parent),
    latestReplyAt: reply.createdAt,
    latestReplyId: reply.id,
    repliers: [reply.author, ...others].slice(FIRST, shownRepliers),
    replyCount: parent.replyCount + ONE_MORE,
  };
}

/** A reply in a thread. `replyTo` is always the top-level message, even when the reply was posted to another reply. */
export interface Reply extends MessageFields {
  readonly kind: "reply";
  readonly replyTo: MessageId;
}

/** A message, tagged by `kind`. */
export type Message = TopLevelMessage | Reply;

/** The `details` of the 409 `thread_moved` refusal of an agent's reply: the thread's newer replies by others, oldest first. */
export interface ThreadMovedDetails {
  readonly replies: readonly Reply[];
}

/** The answer to posting a message. */
export interface MessageResponse {
  readonly message: Message;
  /** Each `@name` in the text that names no identity, once each in the order written. They stay plain text. */
  readonly unknownMentions: readonly string[];
}

/**
 * The names `@`-mentioned in a message's text, matched all at once: a name follows an `@` that is not straight after a
 * letter, digit, `.`, `-` or `@` (so an email address mentions nobody), and may be namespaced, as `@matt/triage-agent`.
 * `@channel` and `@here` are names like any other.
 */
export const mentionPattern = /(?<=(?<![\w.@-])@)[a-z0-9-]+(?:\/[a-z0-9-]+)?/gu;

/** The query of a channel page. With no `before`, the page is the newest messages. */
export interface ListMessagesQuery {
  /** Only messages before this message ID: pass the first message's ID to read further back. */
  readonly before?: number;
  /** 1–200 messages. Default 50. */
  readonly limit?: number;
}

/** A page of a channel's top-level messages, oldest first. `hasMore` says older ones remain before the first. */
export interface ListMessagesResponse {
  readonly messages: readonly TopLevelMessage[];
  readonly hasMore: boolean;
  /** The read receipts of every message on the page, those not seen yet included. */
  readonly receipts: readonly ReadReceipt[];
}

/** A top-level message and its replies, oldest first. */
export interface ThreadResponse {
  readonly parent: TopLevelMessage;
  readonly replies: readonly Reply[];
  /** The read receipts of the top-level message and every reply, those not seen yet included. */
  readonly receipts: readonly ReadReceipt[];
}

/**
 * Whether, and when, one of a message's receipt identities has seen it: its read position in the message's thread or
 * channel has reached or passed it. Once seen, a receipt stays seen, though a mark unread moves the read position back.
 */
export interface ReadReceipt {
  readonly messageId: MessageId;
  readonly identity: IdentityName;
  readonly seen: boolean;
  /** When it was first seen. Absent while not seen, and for a message seen before the cookout kept receipts. */
  readonly seenAt?: IsoTime;
}

/** A message, and for a reply the author of its top-level message. */
export interface ReceiptIdentitiesOf {
  readonly message: Message;
  readonly parentAuthor?: IdentityName | undefined;
}

/**
 * The identities that get a read receipt for a message: the ones it mentions, plus the parent message's author for a
 * reply, but never the message's own author.
 * @param of The message, and for a reply its top-level message's author.
 * @param of.message The message.
 * @param of.parentAuthor For a reply, the name of its top-level message's author.
 * @returns Each receipt identity once, in the order the message names them.
 */
export function receiptIdentitiesOf({ message, parentAuthor }: ReceiptIdentitiesOf): readonly IdentityName[] {
  const names = new Set(message.mentions);
  if (message.kind === "reply" && typeof parentAuthor === "string") {
    names.add(parentAuthor);
  }
  names.delete(message.author.name);
  return [...names];
}

/**
 * A reaction an identity can leave on a message: thumbs up or thumbs down (Matt, 2026-11-23, mattpocock/cookout#199).
 * The list is closed, and `reactionNames` owns it.
 */
export type ReactionName = "thumbs_up" | "thumbs_down";

/** Every reaction, in the order a message lists them. */
export const reactionNames: readonly ReactionName[] = ["thumbs_up", "thumbs_down"];

/** How each reaction is shown. */
export const reactionSymbols: Readonly<Record<ReactionName, string>> = { thumbs_down: "👎", thumbs_up: "👍" };

/**
 * Whether `value` names a reaction.
 * @param value The text to check.
 * @returns Whether `value` is a `ReactionName`.
 */
export function isReactionName(value: string): value is ReactionName {
  return reactionNames.some((name) => name === value);
}

/** How many identities left one reaction on a message, and who, oldest reaction first. */
export interface ReactionCount {
  readonly reaction: ReactionName;
  readonly count: number;
  readonly by: readonly IdentityName[];
}

/** One identity's reaction on one message. An identity has at most one of each reaction on a message. */
export interface Reaction {
  readonly messageId: MessageId;
  readonly identity: IdentityName;
  readonly reaction: ReactionName;
  readonly reactedAt: IsoTime;
}

/** The answer to adding or removing a reaction: the message's reactions as they now are. */
export interface ReactionsResponse {
  readonly messageId: MessageId;
  readonly channel: ChannelName;
  readonly reactions: readonly ReactionCount[];
}

/** The size of a channel page: 50 unless the query says otherwise, and never more than 200. */
export const pageSize = { default: 50, maximum: 200, minimum: 1 } as const;

/** `POST /v1/messages`: posts a top-level message or a reply. */
export const messagesPath = "/v1/messages";

/** `GET /v1/channels/:name/messages?before=<id>&limit=<n>`: a page of the channel's top-level messages. */
export const channelMessagesPath = "/v1/channels/:name/messages";

/** `GET /v1/messages/:id/thread`: the thread holding the message. */
export const threadPath = "/v1/messages/:id/thread";

/**
 * `PUT` adds and `DELETE` removes the caller's reaction on a message, where `:reaction` is one of `reactionNames`.
 * Adding one already there, or removing one that isn't, changes nothing.
 */
export const reactionPath = "/v1/messages/:id/reactions/:reaction";

/** The codes the message routes refuse with: a missing message or reaction (404), a reply in another channel (400). */
export const messageErrorCodes = ["message_not_found", "reply_in_other_channel", "reaction_not_found"] as const;

/** The answer to closing or reopening a thread: its top-level message as it now stands. */
export interface TopLevelMessageResponse {
  readonly message: TopLevelMessage;
}

/** `PUT` closes and `DELETE` reopens the thread holding the message. */
export const closedPath = "/v1/messages/:id/closed";

/** Open threads, stalest first by `lastActivityAt` (latest message or later reopen); `cursor` is null on the last page. */
export interface ListOpenThreadsResponse {
  readonly threads: readonly { readonly message: TopLevelMessage; readonly lastActivityAt: IsoTime }[];
  readonly hasMore: boolean;
  readonly cursor: string | null;
}

/** An open thread: its top-level message and when anything last happened in it. */
export type OpenThread = ListOpenThreadsResponse["threads"][number];
