import type {
  AckedInbox,
  AckedMessage,
  HistoryPageRequest,
  InboxSection,
  Scope,
  StoredHistoryItem,
  StoredHistoryPage,
  StoredInboxItem,
} from "./inbox.ts";
import { Array as Arr, Effect, Option, Predicate, pipe } from "effect";
import type { Channel, ChannelName } from "../../../channels/index.ts";
import type { InboxReason, MovedBackReadPosition } from "../../../inbox/index.ts";
import type { Message, MessageId, ReadReceipt } from "../../../messages/index.ts";
import { ackAllIn, ackIn, ackMessageIn, moveBackIn, readPositionsIn, receiptsOf } from "./read-positions-memory.ts";
import { followersOf, mentionsOwnAuthor, newestPerScope, scopeOf } from "./inbox.ts";
import { reactionHistoryFor, shownItem } from "./inbox-memory-state.ts";
import type { IdentityName } from "../../../identities/index.ts";
import type { MemoryInbox } from "./inbox-memory-state.ts";
import type { StorageUnavailable } from "./errors.ts";
import { threadIdOf } from "./messages.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface MemoryBoard {
  readonly messages: readonly Message[];
  readonly inbox: MemoryInbox;
}

interface BoardAccess {
  readonly read: <Value>(work: (board: MemoryBoard) => Value) => Fails<Value>;
  readonly changeInbox: <Value>(work: (board: MemoryBoard) => readonly [Value, MemoryInbox]) => Fails<Value>;
  readonly channelExists: (channel: ChannelName) => Fails<boolean>;
  readonly listChannels: () => Fails<readonly Channel[]>;
}

interface Asking {
  readonly board: MemoryBoard;
  readonly id: MessageId;
  readonly identity: IdentityName;
}

type Changed<Value> = readonly [Option.Option<Value>, MemoryInbox];

type KeysChange = (keys: ReadonlySet<string>, key: string) => ReadonlySet<string>;

interface Appended {
  readonly inbox: MemoryInbox;
  readonly message: Message;
  readonly messages: readonly Message[];
}

interface Reading {
  readonly board: MemoryBoard;
  readonly identity: IdentityName;
}

const NOTHING_READ = 0;

function keyOf(identity: IdentityName, { channel, thread }: Scope): string {
  if (Predicate.isNull(thread)) {
    return `${identity} channel ${channel}`;
  }
  return `${identity} thread ${String(thread)}`;
}

function mentionKeyOf(identity: IdentityName, id: MessageId): string {
  return `${identity} message ${String(id)}`;
}

function threadScopeOf(message: Message): Scope {
  return { channel: message.channel, thread: threadIdOf(message) };
}

function withKey(keys: ReadonlySet<string>, key: string): ReadonlySet<string> {
  return new Set([...keys, key]);
}

function withoutKey(keys: ReadonlySet<string>, key: string): ReadonlySet<string> {
  return new Set(Arr.filter([...keys], (kept) => kept !== key));
}

function ackedByAuthor({ inbox, message, messages }: Appended): readonly [readonly ReadReceipt[], MemoryInbox] {
  if (mentionsOwnAuthor(message)) {
    return [[], inbox];
  }
  const author = message.author.name;
  const key = keyOf(author, scopeOf(message));
  const [{ receipts }, moved] = ackIn({ at: message.createdAt, identity: author, inbox, key, message, messages });
  return [receipts, moved];
}

function afterAppend(appended: Appended): readonly [readonly ReadReceipt[], MemoryInbox] {
  const { inbox, message } = appended;
  const followed = Arr.map(followersOf(message), (name) => keyOf(name, threadScopeOf(message)));
  const mentioned = Arr.map(message.mentions, (name) => mentionKeyOf(name, message.id));
  const [receipts, moved] = ackedByAuthor(appended);
  return [
    receipts,
    {
      ...moved,
      follows: new Set([...inbox.follows, ...followed]),
      mentions: new Set([...inbox.mentions, ...mentioned]),
    },
  ];
}

function isRead({ board, identity }: Reading, message: Message): boolean {
  const marker = board.inbox.positions.get(keyOf(identity, scopeOf(message))) ?? NOTHING_READ;
  return message.id <= marker;
}

function reasonsFor(reading: Reading, message: Message): readonly InboxReason[] {
  const { follows, mentions, subscriptions } = reading.board.inbox;
  const key = keyOf(reading.identity, scopeOf(message));
  const followed = message.kind === "reply" && follows.has(key);
  const mentioned = mentions.has(mentionKeyOf(reading.identity, message.id));
  const subscribed = message.kind === "top-level" && subscriptions.has(key);
  const reasons: readonly (readonly [InboxReason, boolean])[] = [
    ["followed-thread", followed],
    ["mention", mentioned],
    ["subscribed-channel", subscribed],
  ];
  return Arr.map(
    Arr.filter(reasons, ([, holds]) => holds),
    ([reason]) => reason,
  );
}

function historyItemFor(reading: Reading, message: Message): readonly StoredHistoryItem[] {
  const { board } = reading;
  const read = isRead(reading, message);
  if (message.author.name !== reading.identity) {
    return shownItem({ board, message, read, reasons: reasonsFor(reading, message) });
  }
  if (mentionsOwnAuthor(message)) {
    return shownItem({ board, message, read, reasons: ["mention"] });
  }
  return [];
}

function historyOf(reading: Reading): readonly StoredHistoryItem[] {
  return Arr.flatMap(reading.board.messages, (message) => historyItemFor(reading, message));
}

function inboxOf(reading: Reading): readonly StoredInboxItem[] {
  return Arr.flatMap(historyOf(reading), ({ message, parent, read, reasons }) => {
    if (read) {
      return [];
    }
    return [{ message, parent, reasons }];
  });
}

function withReactionHistory(reading: Reading): readonly StoredHistoryItem[] {
  return Arr.flatMap(reading.board.messages, (message) => [
    ...historyItemFor(reading, message),
    ...reactionHistoryFor({ ...reading, message }),
  ]);
}

function historyPageOf(reading: Reading, page: HistoryPageRequest): StoredHistoryPage {
  const { before = Number.MAX_SAFE_INTEGER, limit } = page;
  const older = Arr.filter(withReactionHistory(reading), (item) => item.message.id < before);
  const shown = Arr.reverse(Arr.takeRight(older, limit));
  return { hasMore: older.length > shown.length, items: shown };
}

function findIn(board: MemoryBoard, id: MessageId): Option.Option<Message> {
  return Arr.findFirst(board.messages, (message) => message.id === id);
}

function inboxItemOf(reading: Reading, id: MessageId): StoredInboxItem | undefined {
  return pipe(
    findIn(reading.board, id),
    Option.flatMap((message) => Arr.head(historyItemFor(reading, message))),
    Option.filter(({ read }) => !read),
    Option.map(({ message, parent, reasons }): StoredInboxItem => ({ message, parent, reasons })),
    Option.getOrUndefined,
  );
}

interface PositionMoving {
  readonly board: MemoryBoard;
  readonly key: string;
  readonly message: Message;
}

type PositionMove<Value> = (moving: PositionMoving) => readonly [Value, ReadonlyMap<string, MessageId>];

function moving<Value>(move: PositionMove<Value>) {
  return ({ board, id, identity }: Asking): Changed<Value> =>
    Option.match(findIn(board, id), {
      onNone: () => [Option.none(), board.inbox],
      onSome: (message) => {
        const [value, positions] = move({ board, key: keyOf(identity, scopeOf(message)), message });
        return [Option.some(value), { ...board.inbox, positions }];
      },
    });
}

function ack({ at, board, id, identity }: Asking & { readonly at: Message["createdAt"] }): Changed<AckedMessage> {
  return Option.match(findIn(board, id), {
    onNone: () => [Option.none(), board.inbox],
    onSome: (message) => {
      const key = keyOf(identity, scopeOf(message));
      const [acked, inbox] = ackMessageIn({ at, identity, inbox: board.inbox, key, message, messages: board.messages });
      return [Option.some(acked), inbox];
    },
  });
}

const moveBack = moving<MovedBackReadPosition>(({ board, key, message }) =>
  moveBackIn({ key, message, messages: board.messages, positions: board.inbox.positions }),
);

interface AckingInbox {
  readonly at: Message["createdAt"];
  readonly board: MemoryBoard;
  readonly identity: IdentityName;
  readonly upTo: MessageId;
}

function ackInbox({ at, board, identity, upTo }: AckingInbox): readonly [AckedInbox, MemoryInbox] {
  return ackAllIn({
    at,
    identity,
    inbox: board.inbox,
    keyFor: (message) => keyOf(identity, scopeOf(message)),
    messages: board.messages,
    newest: newestPerScope({ items: inboxOf({ board, identity }), upTo }),
  });
}

function follow(change: KeysChange) {
  return ({ board, id, identity }: Asking): Changed<MessageId> => {
    const { inbox } = board;
    return Option.match(findIn(board, id), {
      onNone: () => [Option.none(), inbox],
      onSome: (message) => [
        Option.some(threadIdOf(message)),
        { ...inbox, follows: change(inbox.follows, keyOf(identity, threadScopeOf(message))) },
      ],
    });
  };
}

type MemoryInboxSection = InboxSection;

function memoryInbox({ changeInbox, channelExists, listChannels, read }: BoardAccess): MemoryInboxSection {
  function changeFound<Value>(work: (board: MemoryBoard) => Changed<Value>): Fails<Value | undefined> {
    return Effect.map(changeInbox(work), Option.getOrUndefined);
  }
  function subscription(change: KeysChange) {
    return (identity: IdentityName, channel: ChannelName): Fails<boolean> =>
      Effect.flatMap(channelExists(channel), (exists) => {
        if (!exists) {
          return Effect.succeed(false);
        }
        const key = keyOf(identity, { channel, thread: null });
        return changeInbox((board) => [
          true,
          { ...board.inbox, subscriptions: change(board.inbox.subscriptions, key) },
        ]);
      });
  }
  return {
    ackInbox: (identity, upTo, at) => changeInbox((board) => ackInbox({ at, board, identity, upTo })),
    ackMessage: (identity, id, at) => changeFound((board) => ack({ at, board, id, identity })),
    findInboxItem: (identity, id) => read((board) => inboxItemOf({ board, identity }, id)),
    followThread: (identity, id) => changeFound((board) => follow(withKey)({ board, id, identity })),
    listInbox: (identity) => read((board) => inboxOf({ board, identity })),
    listInboxAfter: (identity, after) =>
      read((board) => Arr.filter(inboxOf({ board, identity }), (item) => item.message.id > after)),
    listInboxHistory: (identity, page) => read((board) => historyPageOf({ board, identity }, page)),
    listReadPositions: (identity) =>
      read(({ inbox, messages }) =>
        readPositionsIn({ messages, positionOf: (scope) => inbox.positions.get(keyOf(identity, scope)) }),
      ),
    listReadReceipts: (ids) => read(({ inbox }) => receiptsOf({ ids, receipts: inbox.receipts })),
    listSubscribedChannels: (identity) =>
      Effect.flatMap(listChannels(), (channels) =>
        read((board) =>
          Arr.filter(channels, (channel) =>
            board.inbox.subscriptions.has(keyOf(identity, { channel: channel.name, thread: null })),
          ),
        ),
      ),
    moveReadPositionBack: (identity, id) => changeFound((board) => moveBack({ board, id, identity })),
    subscribeChannel: subscription(withKey),
    unfollowThread: (identity, id) => changeFound((board) => follow(withoutKey)({ board, id, identity })),
    unsubscribeChannel: subscription(withoutKey),
  };
}

export { type MemoryInboxSection, afterAppend, memoryInbox };
