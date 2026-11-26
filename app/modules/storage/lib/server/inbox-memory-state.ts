import { Array as Arr, Effect, Option, Predicate, String as Str, pipe } from "effect";
import type { Message, MessageId, Reaction, ReadReceipt, Reply, TopLevelMessage } from "../../../messages/index.ts";
import type { NewReaction, ReactionKey, ReactionsSection } from "./reactions.ts";
import { counted, threadIdOf } from "./messages.ts";
import type { ChannelName } from "../../../channels/index.ts";
import type { IdentityName } from "../../../identities/index.ts";
import type { InboxReason } from "../../../inbox/index.ts";
import type { StorageUnavailable } from "./errors.ts";
import type { StoredHistoryItem } from "./inbox.ts";
import { sortedReactions } from "./reactions.ts";

interface MemoryInbox {
  readonly mentions: ReadonlySet<string>;
  readonly follows: ReadonlySet<string>;
  readonly subscriptions: ReadonlySet<string>;
  readonly positions: ReadonlyMap<string, MessageId>;
  readonly receipts: readonly ReadReceipt[];
  readonly reactions: readonly StoredReaction[];
}

interface StoredReaction extends Reaction {
  readonly seen: boolean;
}

const EMPTY_INBOX: MemoryInbox = {
  follows: new Set(),
  mentions: new Set(),
  positions: new Map(),
  reactions: [],
  receipts: [],
  subscriptions: new Set(),
};

interface ForgettingChannel {
  readonly inbox: MemoryInbox;
  readonly channel: ChannelName;
  readonly ids: ReadonlySet<MessageId>;
}

function withoutChannel({ channel, ids, inbox }: ForgettingChannel): MemoryInbox {
  const gone = [` channel ${channel}`, ...Arr.flatMap([...ids], (id) => [` thread ${id}`, ` message ${id}`])];
  function kept(key: string): boolean {
    return !Arr.some(gone, (scope) => Str.endsWith(scope)(key));
  }
  return {
    follows: new Set(Arr.filter([...inbox.follows], kept)),
    mentions: new Set(Arr.filter([...inbox.mentions], kept)),
    positions: new Map(Arr.filter([...inbox.positions], ([key]: readonly [string, MessageId]) => kept(key))),
    reactions: Arr.filter(inbox.reactions, (reaction) => !ids.has(reaction.messageId)),
    receipts: Arr.filter(inbox.receipts, (receipt) => !ids.has(receipt.messageId)),
    subscriptions: new Set(Arr.filter([...inbox.subscriptions], kept)),
  };
}

interface ForgettingIdentity {
  readonly inbox: MemoryInbox;
  readonly identity: string;
}

function withoutIdentity({ identity, inbox }: ForgettingIdentity): MemoryInbox {
  function kept(key: string): boolean {
    return !Str.startsWith(`${identity} `)(key);
  }
  return {
    follows: new Set(Arr.filter([...inbox.follows], kept)),
    mentions: new Set(Arr.filter([...inbox.mentions], kept)),
    positions: new Map(Arr.filter([...inbox.positions], ([key]: readonly [string, MessageId]) => kept(key))),
    reactions: Arr.filter(inbox.reactions, (reaction) => reaction.identity !== identity),
    receipts: Arr.filter(inbox.receipts, (receipt) => receipt.identity !== identity),
    subscriptions: new Set(Arr.filter([...inbox.subscriptions], kept)),
  };
}

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface MemoryBoard {
  readonly messages: readonly Message[];
  readonly inbox: MemoryInbox;
}

interface MemoryReactionsAccess {
  readonly read: <Value>(work: (board: MemoryBoard) => Value) => Fails<Value>;
  readonly changeInbox: <Value>(work: (board: MemoryBoard) => readonly [Value, MemoryInbox]) => Fails<Value>;
}

type Changed = readonly [Option.Option<boolean>, MemoryInbox];

function sameKey(key: ReactionKey): (stored: StoredReaction) => boolean {
  return ({ identity, messageId, reaction }) =>
    identity === key.identity && messageId === key.messageId && reaction === key.reaction;
}

function hasMessage(board: MemoryBoard, id: MessageId): boolean {
  return Arr.some(board.messages, (message) => message.id === id);
}

function asReaction({ identity, messageId, reactedAt, reaction }: StoredReaction): Reaction {
  return { identity, messageId, reactedAt, reaction };
}

function listed(reactions: readonly StoredReaction[]): readonly Reaction[] {
  return sortedReactions(Arr.map(reactions, asReaction));
}

function add(board: MemoryBoard, adding: NewReaction): Changed {
  const { inbox } = board;
  if (!hasMessage(board, adding.messageId)) {
    return [Option.none(), inbox];
  }
  if (Arr.some(inbox.reactions, sameKey(adding))) {
    return [Option.some(false), inbox];
  }
  const { notifiesAuthor, ...reaction } = adding;
  return [Option.some(true), { ...inbox, reactions: [...inbox.reactions, { ...reaction, seen: !notifiesAuthor }] }];
}

function remove(board: MemoryBoard, key: ReactionKey): Changed {
  const { inbox } = board;
  if (!hasMessage(board, key.messageId)) {
    return [Option.none(), inbox];
  }
  const kept = Arr.filter(inbox.reactions, (stored) => !sameKey(key)(stored));
  return [Option.some(kept.length < inbox.reactions.length), { ...inbox, reactions: kept }];
}

function authoredBy(board: MemoryBoard, author: IdentityName): ReadonlySet<MessageId> {
  const own = Arr.filter(board.messages, (message) => message.author.name === author);
  return new Set(Arr.map(own, (message) => message.id));
}

function unseenFor(board: MemoryBoard, author: IdentityName): readonly StoredReaction[] {
  const own = authoredBy(board, author);
  return Arr.filter(board.inbox.reactions, (stored) => !stored.seen && own.has(stored.messageId));
}

function othersReactionsSeen(inbox: MemoryInbox, author: IdentityName, id: MessageId): Option.Option<boolean> {
  const others = Arr.filter(inbox.reactions, (stored) => stored.messageId === id && stored.identity !== author);
  if (!Arr.isReadonlyArrayNonEmpty(others)) {
    return Option.none();
  }
  return Option.some(Arr.every(others, (stored) => stored.seen));
}

function markSeen(board: MemoryBoard, author: IdentityName, ids: readonly MessageId[]): MemoryInbox {
  const own = authoredBy(board, author);
  const marked = new Set(Arr.filter(ids, (id) => own.has(id)));
  const reactions = Arr.map(board.inbox.reactions, (stored) => {
    if (marked.has(stored.messageId)) {
      return { ...stored, seen: true };
    }
    return stored;
  });
  return { ...board.inbox, reactions };
}

interface Shown {
  readonly board: MemoryBoard;
  readonly message: Message;
  readonly read: boolean;
  readonly reasons: readonly InboxReason[];
}

interface Reacting {
  readonly board: MemoryBoard;
  readonly identity: IdentityName;
  readonly message: Message;
}

function currentParent(messages: readonly Message[], id: MessageId): TopLevelMessage | undefined {
  return pipe(
    Arr.findFirst(messages, (found): found is TopLevelMessage => found.kind === "top-level" && found.id === id),
    Option.map((parent) => {
      const replies = Arr.filter(messages, (reply): reply is Reply => reply.kind === "reply" && reply.replyTo === id);
      return counted({ parent, replies });
    }),
    Option.getOrUndefined,
  );
}

function shownItem({ board, message, read, reasons }: Shown): readonly StoredHistoryItem[] {
  const parent = currentParent(board.messages, threadIdOf(message));
  if (!Arr.isReadonlyArrayNonEmpty(reasons) || Predicate.isUndefined(parent)) {
    return [];
  }
  if (message.kind === "top-level") {
    return [{ message: parent, parent, read, reasons }];
  }
  return [{ message, parent, read, reasons }];
}

function reactionHistoryFor({ board, identity, message }: Reacting): readonly StoredHistoryItem[] {
  if (message.author.name !== identity) {
    return [];
  }
  return Option.match(othersReactionsSeen(board.inbox, identity, message.id), {
    onNone: () => [],
    onSome: (read) => shownItem({ board, message, read, reasons: ["reaction"] }),
  });
}

interface LiveIn {
  readonly messages: readonly Message[];
  readonly ids: readonly MessageId[];
}

function liveIdsIn({ ids, messages }: LiveIn): readonly MessageId[] {
  const live = new Set(Arr.map(messages, ({ id }) => id));
  return Arr.filter(ids, (id) => live.has(id));
}

function memoryReactions({ changeInbox, read }: MemoryReactionsAccess): ReactionsSection {
  function changing(work: (board: MemoryBoard) => Changed): Fails<boolean | undefined> {
    return Effect.map(changeInbox(work), Option.getOrUndefined);
  }
  return {
    addReaction: (adding) => changing((board) => add(board, adding)),
    listReactions: (ids) =>
      read(({ inbox, messages }) => {
        const live = liveIdsIn({ ids, messages });
        return listed(Arr.filter(inbox.reactions, (stored) => live.includes(stored.messageId)));
      }),
    listUnseenReactions: (author) => read((board) => listed(unseenFor(board, author))),
    markReactionsSeen: (author, ids) =>
      Effect.asVoid(changeInbox((board) => [true, markSeen(board, author, ids)] as const)),
    removeReaction: (key) => changing((board) => remove(board, key)),
  };
}

export {
  EMPTY_INBOX,
  liveIdsIn,
  type MemoryInbox,
  memoryReactions,
  reactionHistoryFor,
  shownItem,
  withoutChannel,
  withoutIdentity,
};
