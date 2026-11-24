/**
 * The `board` store: what the web knows of the board, loaded through the SDK.
 *
 * `createBoardStore` makes the one board store, the normalized cache the web's stores move into one slice at a time
 * (`docs/adr/0078-the-board-store-is-a-tested-interface-and-owns-catch-up.md`). It is a plain external store:
 * `subscribe` and `snapshot` (`BoardState`, a new object whenever a slice's part changes, the same one until then),
 * read through selectors such as `presences`, each returning the same object until what it reads changes. Nothing is
 * read up front: `subscribeShowing(slice)` subscribes a view that shows that slice, and the slice is read when its first
 * such reader arrives. Each event on `live` is applied to every slice, in one place; an event heard while a slice is
 * being read is applied again on what the read brings, so the event wins, and an event heard twice changes nothing.
 * When the link comes back after being down, each slice someone is showing is read again, and one nobody is showing
 * is read again when it is next shown; that is the store's one catch-up. Its slices: `presence`, every identity's
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
 * and left by `channel-deleted`, with `calls.setSubscribed` keeping the server's refusal, with the channel and the control it was asked `from`. All three
 * are read again on a link back while shown.
 *
 * Messages are one table by ID. `channelPages.subscribeShowing(name)` shows a channel's page (`channelPage(name)`):
 * its first reader reads the newest page and acks its newest message, so viewing a channel counts as reading it; while
 * shown, each new top-level message heard live joins it and is acked; each time it is opened again it reads the newest
 * page again, keeping older pages, and acks the newest; on a link back each open page reads again, paging back to what
 * it shows (`docs/adr/0068-a-page-catches-up-by-reading-again.md`). `loadOlder` pages further back; `post` posts a
 * top-level message, adds it, and only then calls `posted`, so a refused post keeps its text; `call` calls a command
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
 * `calls.createChannel` creates a channel and puts it in the list and the subscriptions; `calls.ack` acks a message,
 * one ack at a time in the order asked; `calls.search` runs a search and answers its page, or the server's refusal,
 * without keeping it, for the `search` store.
 *
 * `Board` and its parts are the old per-channel and per-thread stores the views still read; the routes module makes them
 * as thin adapters over the store's selectors and methods, for the last migration ticket to delete.
 *
 * The board store's `session` is whether the person at the browser is logged in, and as whom, shown with
 * `subscribeShowing("session")` (or `session.subscribe`): it asks the server who the page's client is (`whoami`,
 * which a browser answers with the session cookie); no cookie is simply logged out. Its identity is the identities
 * slice's identity of that name once the slice holds one, so an `identity` event for it (a display name or admin flag
 * changed in another tab) changes it at once; until then, the server's answer. On a link back it asks again, keeping
 * whoever is logged in if the server can't be reached. `logIn` swaps a human identity's token for the session cookie
 * (`POST /v1/session`) through a client with that token for the cookout at `url`; a refused login (an agent's token, a bad token)
 * keeps the server's error code to show.
 *
 * `createLoginApprovals` makes the store the approval page reads: for a login request's user code, the request (its
 * host and when it expires) once the page subscribes, or why it can't be shown, and `approve`, which approves it as
 * whoever is logged in so the terminal that started it finishes logging in. `createAgentJoinApprovals` does the same
 * for an agent join request: the agent it would join or create for the person viewing it, an idle expiry they may
 * lower, and whether to replace the agent's live session.
 */
export type {
  Board,
  BoardSnapshot,
  ChannelMessages,
  Commands,
  MessageBefore,
  Subscriptions,
  ThreadClosing,
  ThreadMessages,
} from "./lib/board-interface.ts";
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
export type { ChannelsState } from "./lib/listed-slices.ts";
export type { ChannelMessagesState, MessageBeforeState, ThreadMessagesState } from "./lib/message-selectors.ts";
export type { CallState } from "./lib/command-call.ts";
export type { SchemaProblem } from "../sdk/index.ts";
export type { PostState } from "./lib/failure.ts";
export type { SubscriptionsState } from "./lib/subscriptions-slice.ts";
export {
  type BoardStore,
  type IdentityCalls,
  type Presences,
  type Session,
  agentSessions,
  createBoardStore,
  deletedIdentities,
  identityList,
  presences,
  reactionRefusal,
  reactionsOf,
} from "./lib/board-store.ts";
export {
  channelList,
  channelPage,
  closingRefusal,
  commandList,
  deletedChannelNotice,
  messageBeforeOf,
  subscribedChannels,
  threadOf,
} from "./lib/board-selectors.ts";
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
