/**
 * The `board` store: what the web knows of the board, loaded through the SDK.
 *
 * `createBoardStore` makes the one board store, the normalized cache the web's stores move into one slice at a time
 * (`docs/adr/0078-the-board-store-is-a-tested-interface-and-owns-catch-up.md`). It is a plain external store:
 * `subscribe` and `snapshot` (`BoardState`, a new object whenever a slice's part changes, the same one until then),
 * read through selectors such as `presences`, each returning the same object until what it reads changes. Nothing is
 * read up front: `subscribeShowing(slice)` subscribes a view that shows that slice, and the slice is read when its first
 * such reader arrives. The store is `live`'s one follower, which it becomes when a view first shows something: each
 * event on `live` is applied to every slice, in one place; an event heard while a slice is
 * being read is applied again on what the read brings, so the event wins, and an event heard twice changes nothing.
 * When the link comes back after being down, each slice someone is showing is read again, and one nobody is showing
 * is read again when it is next shown, and the triggers called while the link was down are forgotten, as a fresh load
 * would have none; that is the store's one catch-up. Inbox items, and the unacked reaction items, the server replays
 * after `Last-Event-ID` (ADR `docs/adr/0071-a-resume-replays-every-unseen-reaction-item.md`) apply by message ID, so
 * one already held changes nothing. Everything else the server keeps no events for, so each slice reads its snapshot
 * again and compares (ADR 0068); the catch-up is one function (`catchUpOf`), the one place that becomes replaying events
 * if the server one day replays every kind. Its slices: `presence`, every identity's
 * presence, read with `GET /v1/presence`, changed by `presence` events and left by `identity-deleted`;
 * `reactions`, read through
 * `reactionsOf(state, message)`: a message arrives with its reactions, the slice holds each `reaction` event's
 * reactions by message ID, and on a link back it reads again the thread of each message it holds and corrects it.
 * `toggle` leaves the reader's reaction on a message, or removes it if the reader has already left it (toggling is
 * the web's, Matt, 2026-11-23, mattpocock/cookout#199), one at a time in the order asked, keeping the server's
 * answer, or its refusal (`reactionRefusal`), until the next toggle;
 * `identities`, every identity, deactivated ones too, sorted by name (`identityList`), read with
 * `GET /v1/identities`, changed by `identity` events and left by `identity-deleted`, whose names
 * `deletedIdentities` keeps until an identity of that name comes back; and each agent's sessions
 * (`agentSessions(agent)(state)`: `null` until read, or if the server refuses), shown with
 * `subscribeShowingSessions(agent)` and read again on an `agent-session` or `identity` event for that agent, on a
 * link back, and once one of them expires, all through the store's one stream listener. `identityCalls` makes the
 * web's identity changes on the server (admin, display name, description, a new agent, and the identity actions) and
 * puts each answer in the slices at once; a refusal rejects its promise and changes nothing.
 *
 * The board's own slices: `channels`, the channel list (`channelList`), read with `GET /v1/channels`, joined by each
 * `channel` event and left by each `channel-deleted` (if the page is on that channel, it goes to the Inbox with the
 * name as `deletedChannelNotice` until `dismissNotice`); a message in a channel the list doesn't have reads it again.
 * `commands` (`commandList`), every registered command, changed by `command` events; `subscriptions`
 * (`subscribedChannels`), the channels the logged-in identity subscribes to, sorted, changed by `subscription` events
 * and left by `channel-deleted`, with `calls.setSubscribed` keeping the server's refusal, with the channel and the control it was asked `from`;
 * `schedules`, every Scheduled message, read with `GET /v1/scheduled-messages` and shown a channel at a time by
 * `scheduleListOf(channel)`, changed by ID by each `scheduled-message` event, which drops a deleted one and keeps its ID
 * in `deletedSchedules` (from every event heard, shown or not) so its posts' markers say so (#391);
 * `calls.createScheduledMessage`, `calls.editScheduledMessage` and `calls.changeScheduledMessage` (pause, resume,
 * remove) apply each answer as that event, and a refusal rejects the promise and changes nothing. All four are read
 * again on a link back while shown. `createScheduleList` holds which channel's schedules the list shows, which one is
 * selected, the delete being confirmed and each change asked (one at a time, keeping a refusal on its schedule), and
 * `cronWords(cron)` writes a cron expression in words, such as `Weekdays at 09:00`, or `null` when it has none.
 *
 * Messages are one table by ID. `channelPages.subscribeShowing(name)` shows a channel's page (`channelPage(name)`):
 * its first reader reads the newest page and acks its newest message, so viewing a channel counts as reading it; while
 * shown, each new top-level message heard live joins it and is acked; each time it is opened again it reads the newest
 * page again, keeping older pages, and acks the newest; on a link back each open page reads again, paging back to what
 * it shows (`docs/adr/0068-a-page-catches-up-by-reading-again.md`). `loadOlder` pages further back; `post` posts a
 * top-level message with any files (#377), adds it, and only then calls `posted`, so a refused post keeps its text and files; `call` calls a command
 * with data typed as JSON, keeping the schema errors of data it refuses, and only a successful call empties
 * `callData` and calls `called`; `showClosed` keeps how many threads of a run of closed threads the feed shows.
 * `threads.subscribeShowing(place, acking)` shows a thread (`threadOf(place)`): read when first shown and again when
 * opened again or on a link back, acking its latest message if a reader that acks has come; a reader that doesn't ack
 * (the Inbox's conversation) calls `threads.ack` itself. A reply heard live joins every loaded thread it belongs to and
 * counts on its held top-level message, once. `threads.reply` posts a reply, reads the thread again and only then
 * calls `posted`. `subscribeShowingBefore(place)` reads the one top-level message just before another
 * (`messageBeforeOf(place)`), for the Inbox's channel conversation. Every `message`, `read-receipt` and `thread` event
 * is applied once to the table, so every view of a message agrees; a read puts what it brings with every event heard
 * meanwhile applied again, so the event wins. `calls.close` and `calls.reopen` close or reopen a thread, one at a time
 * in the order asked, applying the answer as a `thread` event, or keeping the refusal (`closingRefusal`) until the next;
 * `calls.askDelete(message)` asks to delete one of the logged-in human's messages, held as `messageDeleting`'s `asked`
 * for the confirmation to show until `calls.cancelDelete` or the delete; `calls.deleteMessage` deletes it through the SDK
 * (for a top-level message, its whole thread), one delete at a time, applying the answer as a `message-deleted` event,
 * or keeping the refusal, with the message still asked, until the next ask, and hands `answered` the outcome (the
 * message deleted, or the refusal) for the page to say;
 * `calls.createChannel` creates a channel and puts it in the list and the subscriptions; `calls.ack` acks a message,
 * one ack at a time in the order asked; `calls.search` runs a search and answers its page, or the server's refusal,
 * for the `search` store, which keeps only the result message IDs: each result's message goes in the table, with its
 * thread's state for a thread whose top-level message the table doesn't hold, and `searchResultsOf(ids)` reads them
 * back, so a result row follows `message` and `thread` events like every other view of that message.
 * A `message-deleted` event applies a reply's updated top-level message to the table, and marks the message's slot in
 * each channel page and thread that holds it (`deleted`, a deleted top-level message marking its thread's every slot),
 * so a shown view keeps it, to draw as "Message deleted", through a catch-up read after a link back; opening the page
 * or thread again drops the marked slots (a thread whose top-level message is deleted is read anew), as the server's
 * reads no longer have them.
 *
 * The Inbox is one slice, `inbox`, shown with `subscribeShowing("inbox")`. One load reads `GET /v1/inbox`, the read
 * positions and the history's first page, once each, for every part: For you (`inboxOf`, the items no read position
 * covers, oldest first, with the unread notices), Earlier (`earlierOf`, read items newest first, paged further back by
 * `inboxCalls.loadEarlier`), and the history of Offline alerts, Nudges, Deactivation offers and Deactivated quiet agents
 * (`alertsOf`, `nudgesOf`, `offersOf`, `quietAgentsOf`). Read positions (`inboxMovesBack`, `inboxNewLine` below) only
 * move on, except by a `read-position-moved-back` event, which reads the Inbox again. The slice holds each item's
 * message and top-level message by ID: every read and `inbox-item` event puts them in the messages table first, so a
 * `thread`, `message` or `reaction` event reaches an item through the table, and the selectors read them from it. A
 * `read-position` event moves the items it covers to Earlier; a `thread` event that closes a thread reads its Nudges;
 * `channel-deleted` drops the channel's items, Earlier rows, Nudges and read positions; `message-deleted` drops the
 * deleted message's items and Earlier rows, and for a top-level message its whole thread's and its Nudges. On a link back the slice reads
 * again and merges: an item the server shows unread comes back, one it no longer shows moves to Earlier. Each selector
 * returns the same object until what it reads changes. `inboxCalls` makes the Inbox's changes on the server (mark all,
 * mark a channel, mark unread, keep an offer, read a notice, close a nudged thread, hold or release a quiet agent,
 * approve a join), one at a time in the order asked, applying each answer to the slice or keeping the refusal.
 * The Inbox's levels are selectors too, each the same object until the items it reads change: `inboxRows` groups the
 * unread items into rows (`rowsOf`: one per thread, its replies, or per channel,
 * its top-level messages, each with its latest item, count, level and strongest reason, newest first; `rowKey` is a
 * row's key); `inboxCounts` and `inboxCountsByChannel` count the two levels, and `inboxForYou` is the one For you count with the unread notices, for the sidebar's Inbox badge and the page title, for you (a mention, a reaction, a reply
 * in a thread you started) and activity (the rest; Matt, #152, 2026-11-23); `inboxNewsByThread` counts each thread's
 * unread replies and how many are for you; `inboxThreadsWithNews` lists a channel's threads with an item there for a
 * reason besides a subscribed channel (#349); and `inboxNewLine` is where a channel's or thread's "New" line goes: its
 * read position, or above every message once a read position moved back to nothing read.
 *
 * The board store is the web's one caller of the SDK and the one follower of `live` (lint's `web-rules/board-store-owner`
 * holds that): views read it only through the selectors here and change the server only through its methods.
 *
 * The board store's `session` is whether the person at the browser is logged in, and as whom (`loggedInName` reads the name), shown with
 * `subscribeShowing("session")` (or `session.subscribe`): it asks the server who the page's client is (`whoami`,
 * which a browser answers with the session cookie); no cookie is simply logged out. Its identity is the identities
 * slice's identity of that name once the slice holds one, so an `identity` event for it (a display name or admin flag
 * changed in another tab) changes it at once; until then, the server's answer. On a link back it asks again, keeping
 * whoever is logged in if the server can't be reached. `logIn` swaps a human identity's token for the session cookie
 * (`POST /v1/session`) through a client with that token for the cookout at `url`; a refused login (an agent's token, a bad token)
 * keeps the server's error code to show. `logOut` ends the session on the server (`DELETE /v1/session`, which revokes the
 * session cookie's credential) and is then logged out; if the server doesn't answer, it asks who is logged in again.
 *
 * `createLoginApprovals` makes the store the approval page reads: for a login request's user code, the request (its
 * host and when it expires) once the page subscribes, or why it can't be shown, and `approve`, which approves it as
 * whoever is logged in so the terminal that started it finishes logging in. `createAgentJoinApprovals` does the same
 * for an agent join request: the agent it would join or create for the person viewing it, an idle expiry they may
 * lower, and whether to replace the agent's live session.
 *
 * `selectedStore({ subscribe, snapshot })` is an external store over one of the board store's subscriptions that reads
 * it through a selector (`snapshot`, such as `() => commandList(store.snapshot())`): it calls its listeners only when the
 * selector's answer is a different object, so a view reading one part of the board re-renders only when that part
 * changes, not on every change anywhere on the board (#495). `sameSnapshot({ before, after })` is whether a store's new
 * snapshot holds the same value in every field (an array field, the same items), for a store to publish nothing then.
 */
export { sameSnapshot, selectedStore } from "./lib/selected.ts";
export type { BoardCalls, MessageDeletes, ThreadClosing } from "./lib/board-calls.ts";
export type { ClosingRefusal } from "./lib/thread-closing.ts";
export type { DeleteOutcome, MessageDeleting } from "./lib/message-deleting.ts";
export type { ListedSchedules } from "./lib/schedules-slice.ts";
export {
  type ChannelCreation,
  type ChannelCreationSnapshot,
  type CreationState,
  createChannelCreation,
} from "./lib/channel-creation.ts";
export {
  type ScheduleKind,
  type Scheduling,
  type SchedulingSnapshot,
  createScheduling,
} from "./lib/scheduling.ts";
export type { ChannelsState, CommandsState } from "./lib/listed-slices.ts";
export {
  type ScheduleList,
  type ScheduleListState,
  createScheduleList,
} from "./lib/schedule-list.ts";
export { cronWords } from "./lib/cron-words.ts";
export type { ChannelMessagesState, MessageBeforeState, ThreadMessagesState } from "./lib/message-selectors.ts";
export type { CallState } from "./lib/command-call.ts";
export type { SchemaProblem } from "../sdk/index.ts";
export type { PostState } from "./lib/failure.ts";
export type { Outgoing } from "./lib/outgoing.ts";
export type { SubscriptionsState } from "./lib/subscriptions-slice.ts";
export {
  type BoardStore,
  type IdentityCalls,
  type Presences,
  type Session,
  createBoardStore,
} from "./lib/board-store.ts";
export {
  agentSessions,
  deletedIdentities,
  identityList,
  loggedInName,
  presences,
  reactionRefusal,
  reactionsOf,
} from "./lib/part-selectors.ts";
export type { BoardState } from "./lib/board-store.ts";
export type { MarkAllState, MarkChannelRefusal } from "./lib/inbox-calls.ts";
export {
  type AlertsShown,
  type EarlierShown,
  type InboxShown,
  type JoinsShown,
  type NudgesShown,
  type OffersShown,
  type QuietAgentsShown,
  alertsOf,
  earlierOf,
  inboxMovesBack,
  inboxOf,
  joinRefusalsOf,
  nudgesOf,
  offersOf,
  quietAgentsOf,
} from "./lib/inbox-selectors.ts";
export {
  inboxCounts,
  inboxCountsByChannel,
  inboxForYou,
  inboxNewLine,
  inboxNewsByThread,
  inboxRows,
  inboxThreadsWithNews,
} from "./lib/inbox-levels-selectors.ts";
export {
  NO_COUNTS,
  type ThreadNews,
  type UnreadCounts,
  type UnreadWhy,
} from "./lib/inbox-levels.ts";
export { type InboxRow, rowKey, rowsOf } from "./lib/inbox-rows.ts";
export { calledTrigger } from "./lib/triggers-slice.ts";
export {
  channelList,
  channelPage,
  closingRefusal,
  commandList,
  deletedChannelNotice,
  deletedSchedules,
  messageBeforeOf,
  messageDeleting,
  scheduleListOf,
  subscribedChannels,
  threadOf,
} from "./lib/board-selectors.ts";
export { searchResultsOf } from "./lib/search-selectors.ts";
export {
  type LoginApproval,
  type LoginApprovalState,
  type LoginApprovals,
  type LoginRequest,
  createLoginApprovals,
} from "./lib/login-approval.ts";
export {
  type AgentJoinApproval,
  type AgentJoinApprovalState,
  type AgentJoinApprovals,
  createAgentJoinApprovals,
} from "./lib/agent-join-approval.ts";
