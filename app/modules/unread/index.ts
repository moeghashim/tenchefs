/**
 * The `unread` store: a thin adapter over the board store's Inbox (`createBoardStore`, ticket #308), for the views
 * that read the Inbox through it. The board store holds the state: one Inbox read (`GET /v1/inbox`), the read
 * positions (`GET /v1/read-positions`) and one first page of the Inbox history (`GET /v1/inbox/history`) per load or
 * catch-up, shared by every part below, with the live events applied in one place. This module keeps the shape the
 * views read and the page state that stays here: the "New" lines, the selection and the reading rule. The levels and
 * rows below (`rowsOf`, `rowKey`) are the board store's,
 * re-exported for the views (the sidebar, the Inbox rows and the channel feed read the board's selectors), and a "New" line takes its place from the board's `inboxNewLine`.
 * The unread inbox items of whoever is looking, oldest first. An external store, read by components with
 * `useSyncExternalStore`, loaded when its first reader subscribes, a message there for several reasons held once.
 * Each new inbox item (`inbox-item`) joins them, and each new read
 * position (`read-position`, from this tab's ack on view or any other
 * session's) drops the items it covers, so opening a channel or a thread takes
 * its messages out. When the stream's link comes back after being down, it reads the inbox and the read positions
 * again, since the stream doesn't replay what it missed: read positions moved on meanwhile drop their items, and
 * those moved back meanwhile bring theirs back, as `read-position-moved-back` does. It never acks anything itself: a message is read only once
 * some view acks it. A refusal keeps the server's error code; a server that
 * can't be reached is `unreachable`. The items have two levels, as Slack
 * shows them (Matt, #152, 2026-11-23): for you (a mention, or a reply in a
 * thread you started) and activity (the rest). A row says why it is there,
 * the board's `inboxCountsByChannel` counts both levels by channel, and `newsByThread` counts a
 * thread's unread replies and how many of them are for you. `threadsWithNews` lists, oldest first, the top-level
 * messages of a channel's threads with an item there for some reason besides a subscribed channel (a mention, a
 * reply in a thread you follow, a reaction): what keeps a closed thread out of the channel's fold (#349). `rowsOf` groups
 * items, unread or `earlier`'s, into the inbox's rows: one per thread (its
 * replies) or channel (its top-level messages), as read positions are keyed,
 * each with its latest item, count, level and strongest reason, newest first; `rowKey` is the key of a
 * thread's row or a channel's.
 * Being derived from the items, the rows move with every live path above.
 * `earlier` is the read part of the inbox, for the inbox view's Earlier list: from the history's first page, read
 * ones newest first, reading on until a page holds one, and `loadMore` reads the next page of `pageSize` items (the
 * board store's, 50 unless given), for the "Show earlier" button; its state says the page size.
 * An item a read position takes out of the counts joins it, so opening an item moves it there.
 * `newLine` is where a channel's or
 * thread's "New" line goes: its read position when the view opened, so the
 * line sits above the first message after it, kept while the view is open.
 * A closed thread's items stay in `items`, listed and counted like any other;
 * `thread` events keep each item's `parent` current, so its `closedAt` follows
 * a close or reopen live. `channel-deleted` takes the channel's items, Earlier rows and Nudges out.
 * `markChannelRead` acks one channel's items, the newest in its top-level messages and in each of its threads
 * (`POST /v1/ack`), and drops the items the read positions it moved cover, as `markAllRead` does; `markChannel` holds
 * why the last one failed, with its channel, until the next one starts.
 * `markAllRead` acks the whole inbox up to the newest item the store holds
 * (`POST /v1/inbox/ack-all`) and drops the items the read positions it moved
 * cover, so a message that arrives meanwhile stays unread. `markUnread` marks
 * a message unread (`POST /v1/read-positions/unread`): it and each read
 * position moved back (`read-position-moved-back`, from any session) replace
 * the read position there, though it was newer, take the items after it out of
 * `earlier`, read the inbox again to bring them back, and move the "New" line
 * of a view open there above the first of them, or above every message when
 * it was a channel's first. `menu` is what a message's actions menu uses: its
 * Mark unread calls `markUnread`, and its `refusal` is why the last
 * Mark unread was refused, until the next one. `alerts` holds the caller's offline alerts: the unread ones, from the
 * inbox and each `offline-alert` event, join the loaded state beside the items, and its own snapshot, loaded from the
 * inbox history's first page, lists them all, read or not, for the Earlier list. Marking one read
 * (`POST /v1/inbox/alerts/:id/read`) takes it out of the unread ones, and `markAllRead` marks every alert up to the
 * newest it holds read with the items. `nudges` holds the caller's Nudges the same way: the unread ones, from the inbox
 * and each `nudge` event, join the loaded state beside the items, and its own snapshot, from the inbox history's first
 * page, lists them all for the Earlier list. One turns read when it is marked read (`POST /v1/inbox/nudges/:id/read`),
 * with `markAllRead`, when `close` closes its thread (`PUT` on the thread's close route), and live when a `thread`
 * event closes its thread or a `message` event brings a reply in it, as the server reads it then, or a `nudge-read`
 * event names it, as when another page of the caller's marks it read.
 * `deactivationOffers` holds the caller's Deactivation offers the same way: the open ones, from the inbox and each
 * `deactivation-offer` event, join the loaded state beside the items, and its own snapshot, from the inbox history's
 * first page, lists them all, open or cleared, for the Earlier list. One is cleared when Keep answers it
 * (`POST /v1/inbox/deactivation-offers/:id/keep`), with `markAllRead`, which clears it as Keep does (Matt, #232,
 * 2026-11-23), and live when its event says so (another recipient's Keep, the identity's activity or deactivation).
 * `deactivatedQuietAgents` holds the caller's Inbox entries about agents deactivated after 90 days with no Activity the
 * same way: the unread ones, from the inbox and each `deactivated-quiet-agent` event, join the loaded state beside the
 * items, and its own snapshot lists them all for the Earlier list. One turns read when it is marked read
 * (`POST /v1/inbox/deactivated-quiet-agents/:id/read`), with `markAllRead`, and live when its event says so, as when
 * the agent is reactivated in any session. `hold` keeps one in For you even once it is read, as Reactivate in its row
 * does once it succeeds and the fresh token shows (never after a refused one, #278), until `release` (Done): the loaded state lists it under `heldDeactivatedQuietAgents`,
 * uncounted, and its own snapshot names it in `held`, so Earlier leaves it out (#277). Only the store holding it keeps it.
 * `createReading` makes the `reading` store, beside the unread store: the Inbox's read rule, as Slack's (Matt, Inbox grilling
 * on the board, 2026-11-23), so a glance, a misclick or keys moving past a row read nothing.
 * `reader(key, sources)` is the reader of one selected conversation, the same
 * store each time for one key; it starts when its first subscriber arrives and
 * starts afresh, forgetting everything, once the last one leaves, as when the
 * selection moves. Opening a conversation reads nothing: once it has shown
 * the same newest message for 2 s, with the page visible and focused (the
 * `page-focus` store), the reader acks it. Losing focus restarts the count,
 * and so does a new message arriving live, whose ack then covers it. A
 * message of the reader's own arriving (a reply) acks at once. `markRead`
 * acks the newest message at once too; after either, `marked` is true for
 * 5 s, the "Marked as read" note. `markUnread` (also the note's Undo) marks
 * the conversation unread from its first message that was unread when the
 * reader started, or from its newest if none was, and holds the read rule off
 * (`held`) until the reader starts afresh. Time passes on the `Clock` it is
 * made with: `browserReadingTools()` are `browserClock` and the document's focus,
 * and tests bring a clock they move on by hand.
 */
import type {
  AgentJoinRequests,
  Alerts,
  DeactivatedQuietAgents,
  DeactivationOffers,
  Earlier,
  InboxBoard,
  MarkChannel,
  MessageMenu,
  Nudges,
  UnreadState,
} from "./lib/inbox-stores.ts";
import type { ChannelName, MessageId } from "../sdk/index.ts";
import type { NewLine, WithNewLines } from "./lib/new-lines.ts";
import { inboxMovesBack, inboxNewLine } from "../board/index.ts";
import { inboxStoresOf } from "./lib/inbox-stores.ts";
import { withNewLines } from "./lib/new-lines.ts";

/** The unread store. `subscribe` and `snapshot` are the two halves `useSyncExternalStore` takes. */
export interface Unread {
  /** Calls `listener` after every change, until the returned function is called. */
  readonly subscribe: (listener: () => void) => () => void;
  /** The current snapshot: a new object whenever a count changes, the same one until then. */
  readonly snapshot: () => UnreadState;
  /** The read inbox items, newest first, a page at a time: an external store of its own. */
  readonly earlier: Earlier;
  /**
   * Where the "New" line goes in a channel's top-level messages (`thread` is `null`) or a thread's replies: the read
   * position there when its first reader subscribed, once the counts have loaded, so the line sits above the first
   * message after it; `null`, with no line, where nothing there has been read; `0`, above every message, where marking
   * a channel's first message unread left nothing read. It stays put while anyone reads it,
   * though the view's own ack moves the read position, and is read afresh when it is opened again.
   */
  readonly newLine: (channel: ChannelName, thread: MessageId | null) => NewLine;
  /** Marks every inbox item the store holds as read, in every channel and thread, leaving any newer one unread. */
  readonly markAllRead: () => void;
  /**
   * Marks every inbox item the store holds from one channel as read, its top-level messages and its threads' replies,
   * by acking the newest of them in each place (`POST /v1/ack`), as reading each to the bottom does.
   */
  readonly markChannelRead: (channel: ChannelName) => void;
  /** Why the last `markChannelRead` failed, with its channel, until the next one starts: an external store of its own. */
  readonly markChannel: MarkChannel;
  /** Marks a message, and everything after it in its thread or channel, unread again; a refusal shows as `menu.refusal`. */
  readonly markUnread: (messageId: MessageId) => void;
  /** What a message's actions menu needs: Mark unread, and why the last one was refused. An external store of its own. */
  readonly menu: MessageMenu;
  /** Every offline alert of the caller's, read or not, newest first, and marking one read: an external store of its own. */
  readonly alerts: Alerts;
  /** Every Nudge of the caller's, read or not, newest first, marking one read and closing its thread: a store of its own. */
  readonly nudges: Nudges;
  /**
   * The Inbox's selected row (none for `null`): a thread's unread items, or a channel's unread top-level ones (`thread`
   * is `null`), each kept from when it is first seen while anyone reads it, read or not, so the row can stay in place
   * and its conversation keeps every post, whether a thread's earlier replies are shown (`expand`), and which post a
   * channel conversation's box replies to (`chooseReplyPost`; `null` for its newest). It starts afresh when it
   * is selected again. An external store of its own.
   */
  readonly selection: WithNewLines<object>["selection"];
  /** Every Deactivation offer of the caller's, open or cleared, newest first, and answering Keep: a store of its own. */
  readonly deactivationOffers: DeactivationOffers;
  /** Every Inbox entry of the caller's about a deactivated quiet agent, read or not, newest first, and marking one read. */
  readonly deactivatedQuietAgents: DeactivatedQuietAgents;
  /**
   * Approve, Replace (approve with `force`) and Dismiss on a pending Agent join request, and why the last of each was
   * refused: a store of its own.
   */
  readonly agentJoinRequests: AgentJoinRequests;
}

/** What the unread store is made with: the board store, whose client, page size and live stream it reads by. */
export interface UnreadOptions {
  readonly boardStore: InboxBoard;
}

/**
 * Makes an unread store over the board store's Inbox.
 * @param options The board store.
 * @returns The store.
 */
export function createUnread(options: UnreadOptions): Unread {
  const { boardStore } = options;
  const stores = inboxStoresOf(boardStore);
  const calls = boardStore.inboxCalls;
  return withNewLines<Omit<Unread, "newLine" | "selection">>({
    agentJoinRequests: stores.agentJoinRequests,
    alerts: stores.alerts,
    deactivatedQuietAgents: stores.deactivatedQuietAgents,
    deactivationOffers: stores.deactivationOffers,
    earlier: stores.earlier,
    heard: boardStore.subscribeShowing("inbox"),
    lineAt: (channel, thread) => inboxNewLine({ channel, state: boardStore.snapshot(), thread }),
    markAllRead: calls.markAllRead,
    markChannel: stores.markChannel,
    markChannelRead: calls.markChannelRead,
    markUnread: calls.markUnread,
    menu: stores.menu,
    movesBack: (channel, thread) => inboxMovesBack({ channel, state: boardStore.snapshot(), thread }),
    nudges: stores.nudges,
    snapshot: stores.inbox.snapshot,
    subscribe: stores.inbox.subscribe,
  });
}

/**
 * The unread inbox items, oldest first, once they have loaded: what the Inbox and the sidebar show and count,
 * closed threads' items included. Beside them are the unread offline alerts and the unread Nudges, newest first.
 */
export type {
  AgentJoinRequests,
  Alerts,
  AlertsState,
  DeactivatedQuietAgents,
  DeactivatedQuietAgentsState,
  DeactivationOffers,
  DeactivationOffersState,
  Earlier,
  EarlierState,
  MarkAllState,
  MessageMenu,
  Nudges,
  NudgesState,
  UnreadState,
} from "./lib/inbox-stores.ts";
export type { Selection } from "./lib/selection.ts";
export {
  type InboxRow,
  NO_COUNTS,
  type ThreadNews,
  type UnreadCounts,
  type UnreadWhy,
  rowKey,
  rowsOf,
} from "../board/index.ts";
export { type Reading, createReading } from "./lib/reading.ts";
export { browserReadingTools } from "./lib/browser-reading.ts";
export type { Newest, Reader, ReaderSources } from "./lib/reader.ts";
