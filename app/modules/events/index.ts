/**
 * Live updates on the wire, shared by the server, the SDK and the web: the
 * events one Server-Sent Events stream sends (ADR 0002) and the stream's
 * path. Each event's SSE `event` field is its `type`, its SSE `id` is the
 * message ID, and its SSE `data` is the event as JSON. The stream starts
 * with one `connected` event, which isn't a `CookoutEvent`: the SDK reads it
 * for the caller. A stream that can't go on ends with one `refusal` event
 * instead.
 */
import type {
  DeactivatedQuietAgent,
  DeactivationOffer,
  InboxAgentJoinRequest,
  InboxItem,
  MovedBackReadPosition,
  Nudge,
  NudgeId,
  OfflineAlert,
  ReadPosition,
  SubscriptionResponse,
} from "../inbox/index.ts";
import type { Identity, IdentityName } from "../identities/index.ts";
import type { LiveConnectionId, Presence, presenceName } from "../presence/index.ts";
import type { Message, MessageId, ReactionsResponse, ReadReceipt, TopLevelMessage } from "../messages/index.ts";
import type { Channel } from "../channels/index.ts";
import type { RegisteredWebhookCommand } from "../webhook-commands/index.ts";
import type { ScheduledMessageEvent } from "../scheduled-messages/index.ts";
import type { Trigger } from "../triggers/index.ts";

export type { ScheduledMessageEvent } from "../scheduled-messages/index.ts";
export type {
  LiveConnectionDetail,
  LiveConnectionId,
  OfflineReason,
  Presence,
  PresenceResponse,
} from "../presence/index.ts";

/** A new item in the caller's inbox, sent the moment another identity posts it. */
export interface InboxItemEvent {
  readonly type: "inbox-item";
  readonly item: InboxItem;
}

/**
 * A Nudge just raised for the caller: a thread it started has been quiet for a while. Sent on every stream of the
 * caller the moment the server raises it, `cookout watch` included. It has no SSE `id`, so a caller that reconnects
 * reads `GET /v1/inbox` again.
 */
export interface NudgeEvent {
  readonly type: "nudge";
  readonly nudge: Nudge;
}

/**
 * Nudges of the caller's just marked read, by `POST /v1/inbox/nudges/:id/read` or by `ackAll`'s `nudgesUpTo` (Mark all
 * as read), named by ID. Sent on every stream of the caller, so a nudge read in one session leaves the unread inbox of
 * the others. `cookout watch` ignores it. It has no SSE `id`.
 */
export interface NudgeReadEvent {
  readonly type: "nudge-read";
  readonly nudgeIds: readonly NudgeId[];
}

/**
 * An Inbox entry of the caller's about an agent deactivated after 90 days with no Activity, as it now stands: sent
 * when the cookout deactivates the agent and again when the entry is read (by Mark read, by marking all as read, or by reactivating the agent), on every stream of each
 * of its recipients, `cookout watch` included. It has no SSE `id`.
 */
export interface DeactivatedQuietAgentEvent {
  readonly type: "deactivated-quiet-agent";
  readonly deactivatedQuietAgent: DeactivatedQuietAgent;
}

/**
 * A Deactivation offer of the caller's as it now stands: sent when it is raised and again when it is cleared (by Keep,
 * by marking all as read, by the agent's activity or deactivation, or by a newer offer about it), on every stream of
 * each of its recipients, `cookout watch` included. It has no SSE `id`.
 */
export interface DeactivationOfferEvent {
  readonly type: "deactivation-offer";
  readonly deactivationOffer: DeactivationOffer;
}

/**
 * The pending Agent join requests the caller may approve, all of them, oldest first, as they now stand: sent whenever
 * one for an agent the caller owns or brought in starts, is approved or expires, on every stream of the caller's,
 * `cookout watch` included. It replaces the list the inbox gave. It has no SSE `id`.
 */
export interface AgentJoinRequestsEvent {
  readonly type: "agent-join-requests";
  readonly agentJoinRequests: readonly InboxAgentJoinRequest[];
}

/** The caller's new read position in a thread or channel, sent the moment any session of the caller acks. */
export interface ReadPositionEvent {
  readonly type: "read-position";
  readonly readPosition: ReadPosition;
}

/**
 * The caller's read position in a thread or channel moved back, sent the moment any session of the caller marks a
 * message there unread: unlike `read-position`, it replaces the one before, though that was newer.
 */
export interface ReadPositionMovedBackEvent {
  readonly type: "read-position-moved-back";
  readonly readPosition: MovedBackReadPosition;
}

/** A new message on any channel, the caller's own included, sent only on the all-channels feed. */
export interface MessageEvent {
  readonly type: "message";
  readonly message: Message;
}

/**
 * A thread just closed or reopened, by Close, Reopen, a reply in a closed thread or a reply sent with `close`: its
 * top-level message as it now
 * stands, with `closedAt` and `closedBy` while closed. Sent only on the all-channels feed. It has no SSE `id`.
 */
export interface ThreadEvent {
  readonly type: "thread";
  readonly parent: TopLevelMessage;
}

/**
 * An identity just created or changed (its display name, admin flag or owner, deactivating or reactivating it), as
 * the server now shows it, sent only on the all-channels feed so every open web UI shows it at once. It has no SSE
 * `id`.
 */
export interface IdentityEvent {
  readonly type: "identity";
  readonly identity: Identity;
}

/**
 * A read receipt just recorded: one of a message's receipt identities has seen it for the first time. Sent only on
 * the all-channels feed, since everyone on the board sees receipts. It has no SSE `id`.
 */
export interface ReadReceiptEvent {
  readonly type: "read-receipt";
  readonly receipt: ReadReceipt;
}

/**
 * A message's reactions just changed: someone added or removed one. It holds the message's reactions as they now are,
 * and is sent only on the all-channels feed, since everyone on the board sees reactions. It has no SSE `id`.
 */
export interface ReactionEvent extends ReactionsResponse {
  readonly type: "reaction";
}

/** A channel just created, sent only on the all-channels feed so every open web UI lists it at once. It has no SSE `id`. */
export interface ChannelEvent {
  readonly type: "channel";
  readonly channel: Channel;
}

/**
 * A channel just deleted, with everything in it, sent only on the all-channels feed so every open web UI drops it at
 * once. It has no SSE `id`.
 */
export interface ChannelDeletedEvent {
  readonly type: "channel-deleted";
  readonly channel: Channel;
}

/**
 * An identity an admin just deleted, as it was, sent only on the all-channels feed so every open web UI drops it from
 * its directory at once. It has no SSE `id`.
 */
export interface IdentityDeletedEvent {
  readonly type: "identity-deleted";
  readonly identity: Identity;
}

/**
 * A command just registered, or whose secret was just rotated, sent only on the all-channels feed so every open web
 * UI suggests it at once. It has no SSE `id`.
 */
export interface CommandEvent {
  readonly type: "command";
  readonly command: RegisteredWebhookCommand;
}

/**
 * An agent's agent session just changed: the agent joined or left, or its owner or an admin revoked its session.
 * Sent only on the all-channels feed of the agent's owner and of admins, the identities who may list its agent
 * sessions, so they list them again. It names the agent alone: the sessions stay behind that list. It has no SSE `id`.
 */
export interface AgentSessionEvent {
  readonly type: "agent-session";
  readonly agent: IdentityName;
}

/**
 * The caller's subscription to a channel just changed: any session of the caller subscribed or unsubscribed, or the
 * caller created the channel, which subscribes them. Sent on every stream of the caller, so its sessions stay in
 * sync. It has no SSE `id`.
 */
export interface SubscriptionEvent {
  readonly type: "subscription";
  readonly subscription: SubscriptionResponse;
}

/**
 * The stream's first word on connecting, before any item: the newest message ID on the board at that moment (null
 * before the first message). Every item the stream then sends live is newer, so a caller that resumes from this ID
 * after a drop misses nothing and repeats nothing. It has no SSE `id`. `connectionId` names this live connection, so
 * a `cookout watch` exiting on purpose can say so first with `DELETE /v1/events/:connection` (a clean close, ADR "how
 * a live connection ends"); a server from before clean closes sends none.
 */
export interface ConnectedEvent {
  readonly type: "connected";
  readonly latestMessageId: MessageId | null;
  readonly connectionId?: LiveConnectionId;
}

/** The answer to a clean close, `DELETE /v1/events/:connection`. */
export interface CleanCloseResponse {
  readonly closed: true;
}

/**
 * One identity's presence just changed (it came online, went offline, or connects another way), sent only on the
 * all-channels feed so every open web UI shows it at once. It has no SSE `id`, so a caller that reconnects reads
 * `GET /v1/presence` again.
 */
export interface PresenceEvent {
  readonly type: typeof presenceName;
  readonly presence: Presence;
}

/**
 * An offline alert of the caller's (GLOSSARY.md) as it now stands: raised the moment an agent it owns goes offline
 * unexpectedly, and sent again when the agent is back online or the alert is marked read. Sent on every stream of the
 * owner, so its sessions stay in sync. It has no SSE `id`.
 */
export interface OfflineAlertEvent {
  readonly type: "offline-alert";
  readonly alert: OfflineAlert;
}

/**
 * An agent's trigger URL as `GET /v1/identities/:name/trigger` answers it, sent the moment a call to it settles, with
 * how that call went in `lastResult` (mattpocock/cookout#414). Sent on every stream of the agent's owner and of the
 * agent that brought it in, the identities that may read it, so an open trigger form shows each call. It has no SSE
 * `id`.
 */
export interface TriggerEvent {
  readonly type: "trigger";
  readonly identity: IdentityName;
  readonly trigger: Trigger;
}

/** Any event the stream sends. */
export type CookoutEvent =
  | InboxItemEvent
  | NudgeEvent
  | NudgeReadEvent
  | DeactivationOfferEvent
  | DeactivatedQuietAgentEvent
  | AgentJoinRequestsEvent
  | ReadPositionEvent
  | ReadPositionMovedBackEvent
  | MessageEvent
  | ThreadEvent
  | IdentityEvent
  | ReadReceiptEvent
  | ReactionEvent
  | ChannelEvent
  | ChannelDeletedEvent
  | IdentityDeletedEvent
  | CommandEvent
  | AgentSessionEvent
  | SubscriptionEvent
  | PresenceEvent
  | OfflineAlertEvent
  | TriggerEvent
  | ScheduledMessageEvent;

/**
 * `GET /v1/events`: the caller's Server-Sent Events stream, one per connection. With `allChannelsQuery` as its query
 * it is also the all-channels feed: every new message on every channel.
 */
export const eventsPath = "/v1/events";

/** `DELETE /v1/events/:connection`: the clean close of the caller's live connection `connection`, answering `CleanCloseResponse`. */
export const liveConnectionPath = `${eventsPath}/:connection`;

/** The query that asks the stream for the all-channels feed: `?channels=all`. */
export const allChannelsQuery = { channels: "all" } as const;

/**
 * The SSE `event` of the stream's last event when it can't go on, such as `agent_session_revoked` once `leave` or
 * another session's `join --force` revokes the agent session token it was opened with: it has no `id`, and its
 * `data` is the refusal's `ErrorResponse` as JSON.
 */
export const refusalEvent = "refusal";
