import type { BeforeState, PageState, ThreadLoaded, ThreadState } from "./message-states.ts";
import type {
  ChannelName,
  CookoutEvent,
  Message,
  MessageId,
  ReadReceipt,
  Reply,
  TopLevelMessage,
} from "../../sdk/index.ts";
import { LOADING } from "./message-states.ts";
import { closedAs } from "./thread-closing.ts";
import { withNewestReply } from "../../messages/index.ts";
import { withReceipts } from "./receipts.ts";

interface MessagesHeld {
  readonly table: ReadonlyMap<MessageId, Message>;
  readonly receipts: ReadonlyMap<MessageId, readonly ReadReceipt[]>;
  readonly pages: ReadonlyMap<ChannelName, PageState>;
  readonly threads: ReadonlyMap<string, ThreadState>;
  readonly before: ReadonlyMap<string, BeforeState>;
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

function withMessage(held: MessagesHeld, message: Message): MessagesHeld {
  if (message.kind === "top-level") {
    return withTopLevel(held, message);
  }
  return withReplyInThreads(withRepliedParent(held, message), message);
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

function withClosing(held: MessagesHeld, parent: TopLevelMessage): MessagesHeld {
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
  return held;
}

function heldTopLevel({ held, id }: { readonly held: MessagesHeld; readonly id: MessageId }): TopLevelMessage | null {
  return topLevelIn(held, id);
}

export { type MessagesHeld, NOTHING_HELD, appliedToMessages, heldTopLevel, withEntry, withFresh };
