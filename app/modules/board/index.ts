/**
 * The `board` store: what the web knows of the board, loaded through the SDK.
 * An external store, read by components with `useSyncExternalStore`; it loads
 * the channels once, when its first reader subscribes. `channel(name)` is that
 * channel's messages, its own store: when its first reader subscribes it loads
 * the newest page of top-level messages and acks the newest one, so viewing a
 * channel counts as reading it, and while a reader is subscribed it acks each
 * new top-level message that arrives live; each time it is opened again (a
 * first reader after none) it reloads the newest page, keeping older pages
 * loaded, and acks its newest message; `loadOlder` pages further back. `thread(channel, id)`
 * is the thread's parent and replies, its own store too: when its first reader
 * subscribes it loads the thread and acks its latest message, so opening a
 * thread counts as reading it, and while a reader is subscribed it acks each
 * new reply that arrives live; each time it is opened again it reloads the
 * thread and acks its latest message. A reader that subscribes with
 * `subscribeWithoutAcking` (the Inbox's conversation) loads, follows and
 * reloads it the same way but acks nothing, on open or on a live reply: it
 * calls `ack` itself when it decides the thread has been read. `reply` posts a reply in that channel,
 * reloads the replies and only then calls `posted`, so a refused reply keeps
 * its text. `commands` is every registered command, loaded when its
 * first reader subscribes (`createCommands` makes such a store alone); a channel's `call` calls a command with data typed
 * as JSON, posting the call message in that channel, and keeps the schema
 * errors of data the command refuses; `editCallData` holds the data being
 * typed (`callData`), which only a successful call empties, and only then
 * is `called` called, so a refused call keeps everything typed. A channel's `post`
 * posts a top-level message there, adds it to the loaded messages and only
 * then calls `posted`, so a refused post keeps its text; the server counts it
 * read for its poster. With `live`, the board opens the live stream when any of
 * its stores is first read, and each new message on it joins the loaded
 * channel or thread it belongs to (a reply also counts in its top-level
 * message's replies), so messages from others appear without a reload; a message
 * in a channel the loaded list doesn't have reloads the list, and each channel
 * created elsewhere joins the loaded list at once, as the stream announces it; each
 * one deleted elsewhere leaves it, and if the page is on it, the page goes to the
 * inbox with its name as the snapshot's `notice` until `dismissNotice`; and each
 * command registered elsewhere joins the loaded `commands`; when the stream's link comes back after being down,
 * the list reloads, and so does each open channel (paging back until it reaches the messages it shows) and thread,
 * acking its newest message, since the stream replays none of what it missed (ADR
 * `docs/adr/0068-a-page-catches-up-by-reading-again.md`). Each loaded channel page and thread keeps its messages' read receipts
 * (`receipts`), and each read receipt recorded elsewhere joins the store holding its message, as the stream sends it. `subscriptions` is the names of the channels
 * the logged-in identity subscribes to, sorted, loaded when its first reader
 * subscribes; `setSubscribed` subscribes to a channel or unsubscribes from it,
 * keeping the refusal, with the channel, if the server refuses. With `live`, a subscribe or unsubscribe from
 * another session of the identity reaches it at once. `creation`
 * is the new channel form: whether it is open and what is typed in it;
 * `create` creates the channel as `cookout channel create` does, which subscribes
 * the creator, adds it to the loaded list and the subscriptions, empties and closes the form and only then calls `created`,
 * so a refused name keeps what was typed, with the refusal on the field it
 * concerns (the description's own schema errors; anything else, the name). A refusal
 * keeps the server's error code; a server that can't be reached is `unreachable`. `reactions` is the reaction store
 * (the `reaction-store` module) on the board's client and live stream.
 *
 * Each top-level message keeps its thread's `closedAt` and `closedBy` as the server sends them. `closing` closes or
 * reopens the thread holding a message, one at a time in the order asked, and puts the server's answer into every
 * loaded channel and thread, or keeps its `refusal`, with which it was, until the next one. With `live`, each `thread`
 * event does the same, and a live reply opens its thread through the shared newest-reply rule, so a thread closed,
 * reopened or replied to elsewhere changes with no reload. A channel's `showClosed` keeps how many threads of a run
 * of closed threads its feed shows (`expanded`, by each ID in the run) for as long as the page stays open.
 *
 * `messageBefore({ channel, id })` is the one top-level message just before `id` in the channel (none if `id` is
 * its first), its own store: it reads it (`listMessages` with `before` and a limit of 1) when its first reader
 * subscribes, for the Inbox's channel conversation. `ack(id)` acks the message `id`, one ack at a time in the order
 * asked, for the Inbox's reader of a channel conversation; a refused ack leaves the message unread.
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
 * presence, read with `GET /v1/presence` and changed by `presence` events.
 */
import type {
  ChannelMessages,
  MessageBefore,
  MessageStoresClient,
  ThreadClosing,
  ThreadMessages,
} from "./lib/message-stores.ts";
import type { ChannelName, CookoutClient, MessageId } from "../sdk/index.ts";
import type { Commands, CommandsClient } from "./lib/commands.ts";
import type { ReactionStore, ReactionStoreOptions } from "../reaction-store/index.ts";
import type { Subscriptions, SubscriptionsClient } from "./lib/subscriptions.ts";
import type { ChannelCreation } from "./lib/channel-creation.ts";
import type { Live } from "../live/index.ts";
import type { Snapshot } from "./lib/channel-list.ts";
import { createChannelCreation } from "./lib/channel-creation.ts";
import { createChannelList } from "./lib/channel-list.ts";
import { createCommands } from "./lib/commands.ts";
import { createLiveFeed } from "./lib/live-feed.ts";
import { createMessageStores } from "./lib/message-stores.ts";
import { createReactionStore } from "../reaction-store/index.ts";
import { createSubscriptions } from "./lib/subscriptions.ts";

const PAGE_SIZE = 50;

type BoardClient = Pick<CookoutClient, "createChannel" | "listChannels"> &
  CommandsClient &
  MessageStoresClient &
  ReactionStoreOptions["client"] &
  SubscriptionsClient;

/** The board store. `subscribe` and `snapshot` are the two halves `useSyncExternalStore` takes. */
export interface Board {
  /** Calls `listener` after every change, until the returned function is called. */
  readonly subscribe: (listener: () => void) => () => void;
  /** The current snapshot: a new object whenever anything in it changes, the same one until then. */
  readonly snapshot: () => Snapshot;
  /** The named channel's messages: the same store each time for one name. */
  readonly channel: (name: ChannelName) => ChannelMessages;
  /** The thread holding the message in the channel: the same store each time for one channel and ID. */
  readonly thread: (channel: ChannelName, id: MessageId) => ThreadMessages;
  /** Every registered command, sorted by name: one store, loaded when its first reader subscribes. */
  readonly commands: Commands;
  /** The channels the logged-in identity subscribes to: one store, loaded when its first reader subscribes. */
  readonly subscriptions: Subscriptions;
  /** The new channel form: one store, whose channels join the loaded list. */
  readonly creation: ChannelCreation;
  /** The reactions on messages: one store, following the live stream, which toggles the reader's own. */
  readonly reactions: ReactionStore;
  /** Closing and reopening threads: one store, whose answers change the loaded channels and threads. */
  readonly closing: ThreadClosing;
  /** The top-level message just before `id` in `channel`: the same store each time for one channel and ID. */
  readonly messageBefore: (at: { readonly channel: ChannelName; readonly id: MessageId }) => MessageBefore;
  /** Acks the message, after any ack asked before it. */
  readonly ack: (id: MessageId) => void;
  /** Empties the snapshot's `notice`. */
  readonly dismissNotice: () => void;
}

/**
 * What the board is made with: an SDK client with the token of whoever is looking, `pageSize` top-level messages a
 * page (50 unless given), and the live stream to follow, if any.
 */
export interface BoardOptions {
  readonly client: BoardClient;
  readonly pageSize?: number;
  readonly live?: Live;
}

/**
 * Makes a board store that talks to the server through `options.client`.
 * @param options The client, how it pages, and the live stream.
 * @returns The store.
 */
export function createBoard(options: BoardOptions): Board {
  const { client } = options;
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const live = options.live ?? null;
  const stores = createMessageStores({ client, pageSize });
  const list = createChannelList(client);
  const { heard, subscriptions } = createSubscriptions({ client, live });
  const { follow, followed } = createLiveFeed({
    added: list.add,
    back: list.reload,
    deleted: list.remove,
    live,
    receiptReceivers: stores.loaded,
    receivers: () => [list, ...stores.loaded()],
  });
  return {
    ack: stores.ack,
    channel: (name) => stores.channel(name, followed),
    closing: stores.closing,
    commands: createCommands(options),
    creation: createChannelCreation({
      client,
      put: (channel) => {
        list.add(channel);
        heard({ channel: channel.name, subscribed: true });
      },
    }),
    dismissNotice: list.dismissNotice,
    messageBefore: stores.messageBefore,
    reactions: createReactionStore({ client, live }),
    snapshot: list.snapshot,
    subscribe: (listener) => {
      follow();
      return list.subscribe(listener);
    },
    subscriptions,
    thread: (channel, id) => stores.thread({ channel, id }, followed),
  };
}

export type { ChannelCreation, ChannelCreationSnapshot, CreationState } from "./lib/channel-creation.ts";
export type { ChannelsState } from "./lib/channel-list.ts";
export type { ChannelMessages, ChannelMessagesState } from "./lib/channel-messages.ts";
export type { CallState } from "./lib/command-call.ts";
export type { SchemaProblem } from "../sdk/index.ts";
export type { Commands } from "./lib/commands.ts";
export { createCommands } from "./lib/commands.ts";
export type { PostState } from "./lib/failure.ts";
export type { Subscriptions, SubscriptionsState } from "./lib/subscriptions.ts";
export type { ThreadMessages, ThreadMessagesState } from "./lib/thread-messages.ts";
export type { ThreadClosing } from "./lib/thread-closing.ts";
export type { MessageBeforeState } from "./lib/message-stores.ts";
export { type BoardStore, type Presences, createBoardStore, presences } from "./lib/board-store.ts";
