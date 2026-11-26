import type { BeforeState, PageState, ThreadLoaded, ThreadState } from "./message-states.ts";
import type {
  ChannelName,
  CookoutEvent,
  InboxItem,
  Message,
  MessageId,
  ReadReceipt,
  Reply,
  SearchResult,
  TopLevelMessage,
} from "../../sdk/index.ts";
import { LOADING } from "./message-states.ts";
import { closedAs } from "./thread-closing.ts";
import { viewsMarked } from "./message-deletions.ts";
import { withNewestReply } from "../../messages/index.ts";
import { withReceipts } from "./receipts.ts";

interface MessagesHeld {
  readonly table: ReadonlyMap<MessageId, Message>;
  readonly receipts: ReadonlyMap<MessageId, readonly ReadReceipt[]>;
  readonly pages: ReadonlyMap<ChannelName, PageState>;
  readonly threads: ReadonlyMap<string, ThreadState>;
  readonly before: ReadonlyMap<string, BeforeState>;
  readonly threadsClosed: ReadonlyMap<MessageId, boolean>;
}

interface Fresh {
  readonly messages: readonly Message[];
  readonly receipts: readonly ReadReceipt[];
}

interface Entry<Key, Value> {
  readonly map: ReadonlyMap<Key, Value>;
  readonly key: Key;
  readonly value: Value;
}

interface HeldFresh {
  readonly held: MessagesHeld;
  readonly fresh: Fresh;
}

interface HeldEvent {
  readonly held: MessagesHeld;
  readonly event: CookoutEvent;
}

const NONE = 0;

const NOTHING_HELD: MessagesHeld = {
  before: new Map(),
  pages: new Map(),
  receipts: new Map(),
  table: new Map(),
  threads: new Map(),
  threadsClosed: new Map(),
};

function same(one: unknown, other: unknown): boolean {
  return JSON.stringify(one) === JSON.stringify(other);
}

function withEntry<Key, Value>({ key, map, value }: Entry<Key, Value>): ReadonlyMap<Key, Value> {
  return new Map(map).set(key, value);
}

function topLevelIn(held: MessagesHeld, id: MessageId): TopLevelMessage | null {
  const message = held.table.get(id) ?? null;
  if (message === null) {
    return null;
  }
  if (message.kind !== "top-level") {
    return null;
  }
  return message;
}

function freshTable(
  table: ReadonlyMap<MessageId, Message>,
  messages: readonly Message[],
): ReadonlyMap<MessageId, Message> {
  const changed = messages.filter((message) => !same(table.get(message.id), message));
  if (changed.length === NONE) {
    return table;
  }
  const next = new Map(table);
  for (const message of changed) {
    next.set(message.id, message);
  }
  return next;
}

function freshReceipts(held: MessagesHeld, fresh: readonly ReadReceipt[]): MessagesHeld["receipts"] {
  let next = held.receipts;
  for (const receipt of fresh) {
    const known = next.get(receipt.messageId) ?? [];
    if (!known.some((each) => same(each, receipt))) {
      const value = withReceipts({ fresh: [receipt], receipts: known });
      next = withEntry({ key: receipt.messageId, map: next, value });
    }
  }
  return next;
}

function withFresh({ fresh, held }: HeldFresh): MessagesHeld {
  const table = freshTable(held.table, fresh.messages);
  const receipts = freshReceipts(held, fresh.receipts);
  if (table === held.table && receipts === held.receipts) {
    return held;
  }
  return { ...held, receipts, table };
}

function withTopLevel(held: MessagesHeld, message: TopLevelMessage): MessagesHeld {
  const page = held.pages.get(message.channel) ?? LOADING;
  if (page.status !== "loaded" || page.ids.includes(message.id)) {
    return held;
  }
  const value = { ...page, ids: [...page.ids, message.id] };
  return {
    ...held,
    pages: withEntry({ key: message.channel, map: held.pages, value }),
    table: freshTable(held.table, [message]),
  };
}

function withRepliedParent(held: MessagesHeld, reply: Reply): MessagesHeld {
  const parent = topLevelIn(held, reply.replyTo);
  if (parent === null || (parent.latestReplyId !== null && parent.latestReplyId >= reply.id)) {
    return held;
  }
  return { ...held, table: withEntry({ key: parent.id, map: held.table, value: withNewestReply({ parent, reply }) }) };
}

function joins(thread: ThreadState, reply: Reply): thread is ThreadLoaded {
  return thread.status === "loaded" && thread.parent === reply.replyTo && !thread.replies.includes(reply.id);
}

function withReplyInThreads(held: MessagesHeld, reply: Reply): MessagesHeld {
  let { threads } = held;
  for (const [key, thread] of held.threads) {
    if (joins(thread, reply)) {
      threads = withEntry({ key, map: threads, value: { ...thread, replies: [...thread.replies, reply.id] } });
    }
  }
  if (threads === held.threads) {
    return held;
  }
  return { ...held, table: freshTable(held.table, [reply]), threads };
}

function withThreadClosed(held: MessagesHeld, parent: MessageId, closed: boolean): MessagesHeld {
  const known = held.threadsClosed.get(parent) ?? null;
  if (known === null || known === closed) {
    return held;
  }
  return { ...held, threadsClosed: withEntry({ key: parent, map: held.threadsClosed, value: closed }) };
}

function withMessage(held: MessagesHeld, message: Message): MessagesHeld {
  if (message.kind === "top-level") {
    return withTopLevel(held, message);
  }
  const reopened = withThreadClosed(held, message.replyTo, false);
  return withReplyInThreads(withRepliedParent(reopened, message), message);
}

function withReceipt(held: MessagesHeld, receipt: ReadReceipt): MessagesHeld {
  if (!held.table.has(receipt.messageId)) {
    return held;
  }
  const receipts = freshReceipts(held, [receipt]);
  if (receipts === held.receipts) {
    return held;
  }
  return { ...held, receipts };
}

function withClosing(searched: MessagesHeld, parent: TopLevelMessage): MessagesHeld {
  const held = withThreadClosed(searched, parent.id, typeof parent.closedAt === "string");
  const message = topLevelIn(held, parent.id);
  if (message === null) {
    return held;
  }
  const closed = closedAs({ message, parent });
  if (same(closed, message)) {
    return held;
  }
  return { ...held, table: withEntry({ key: parent.id, map: held.table, value: closed }) };
}

function messagesOfItems(items: readonly InboxItem[]): readonly Message[] {
  const messages = new Map<MessageId, Message>();
  for (const { message, parent } of items) {
    messages.set(parent.id, parent);
    messages.set(message.id, message);
  }
  return [...messages.values()];
}

function withItemMessages(held: MessagesHeld, items: readonly InboxItem[]): MessagesHeld {
  const table = freshTable(held.table, messagesOfItems(items));
  if (table === held.table) {
    return held;
  }
  return { ...held, table };
}

function threadOfMessage(message: Message): MessageId {
  if (message.kind === "reply") {
    return message.replyTo;
  }
  return message.id;
}

interface Searched {
  readonly held: MessagesHeld;
  readonly results: readonly SearchResult[];
}

function withSearched({ held, results }: Searched): MessagesHeld {
  const table = freshTable(
    held.table,
    results.map((result) => result.message),
  );
  let { threadsClosed } = held;
  for (const { message, threadClosed } of results) {
    const thread = threadOfMessage(message);
    if (threadsClosed.get(thread) !== threadClosed) {
      threadsClosed = withEntry({ key: thread, map: threadsClosed, value: threadClosed });
    }
  }
  if (table === held.table && threadsClosed === held.threadsClosed) {
    return held;
  }
  return { ...held, table, threadsClosed };
}

function withDeleted(held: MessagesHeld, deletion: Extract<CookoutEvent, { type: "message-deleted" }>): MessagesHeld {
  const marked = viewsMarked({ deletion, held });
  if (typeof deletion.parent !== "object") {
    return marked;
  }
  return withFresh({ fresh: { messages: [deletion.parent], receipts: [] }, held: marked });
}

function appliedToItems({ event, held }: HeldEvent): MessagesHeld {
  if (event.type === "inbox-item") {
    return withItemMessages(held, [event.item]);
  }
  if (event.type === "message-deleted") {
    return withDeleted(held, event);
  }
  return held;
}

function appliedToMessages({ event, held }: HeldEvent): MessagesHeld {
  if (event.type === "message") {
    return withMessage(held, event.message);
  }
  if (event.type === "read-receipt") {
    return withReceipt(held, event.receipt);
  }
  if (event.type === "thread") {
    return withClosing(held, event.parent);
  }
  return appliedToItems({ event, held });
}

function heldTopLevel({ held, id }: { readonly held: MessagesHeld; readonly id: MessageId }): TopLevelMessage | null {
  return topLevelIn(held, id);
}

export {
  type MessagesHeld,
  NOTHING_HELD,
  appliedToMessages,
  heldTopLevel,
  messagesOfItems,
  threadOfMessage,
  withEntry,
  withFresh,
  withSearched,
};
