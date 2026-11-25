import type { InboxItem, Message, MessageId, TopLevelMessage } from "../../sdk/index.ts";
import type { InboxEntry } from "./inbox-entries.ts";
import type { MessagesHeld } from "./messages-table.ts";

function sameAll(one: readonly unknown[], other: readonly unknown[]): boolean {
  return one.length === other.length && one.every((each, index) => each === other[index]);
}

function keptOn<Key extends object, Rest extends readonly unknown[], Out>(
  compute: (key: Key, ...rest: Rest) => Out,
): (key: Key, ...rest: Rest) => Out {
  const kept = new WeakMap<Key, { readonly rest: Rest; readonly out: Out }>();
  function fresh(key: Key, rest: Rest): Out {
    const out = compute(key, ...rest);
    kept.set(key, { out, rest });
    return out;
  }
  return (key, ...rest) => {
    const held = kept.get(key) ?? null;
    if (held !== null && sameAll(held.rest, rest)) {
      return held.out;
    }
    return fresh(key, rest);
  };
}

type Table = MessagesHeld["table"];

interface Joined {
  readonly message: Message;
  readonly parent: Message;
  readonly item: InboxItem;
}

const joined = new WeakMap<InboxEntry, Joined>();

function isJoined(held: Joined | null, message: Message, parent: TopLevelMessage): held is Joined {
  if (held === null) {
    return false;
  }
  return held.message === message && held.parent === parent;
}

function joinedOf(entry: InboxEntry, message: Message, parent: TopLevelMessage): InboxItem {
  const held = joined.get(entry) ?? null;
  if (isJoined(held, message, parent)) {
    return held.item;
  }
  const { message: _id, parent: _parentId, place: _place, ...rest } = entry;
  const item = { ...rest, message, parent };
  joined.set(entry, { item, message, parent });
  return item;
}

function heldIn(table: Table, id: MessageId): readonly Message[] {
  return [table.get(id) ?? []].flat();
}

function itemsOf(entry: InboxEntry, table: Table): readonly InboxItem[] {
  const parents = heldIn(table, entry.parent).filter((parent) => parent.kind === "top-level");
  return heldIn(table, entry.message).flatMap((message) => parents.map((parent) => joinedOf(entry, message, parent)));
}

const itemsIn = keptOn((held: ReadonlyMap<MessageId, InboxEntry>, table: Table): readonly InboxItem[] =>
  [...held.values()]
    .flatMap((entry) => itemsOf(entry, table))
    .toSorted((first, second) => second.message.id - first.message.id),
);

const stableItems = new WeakMap<ReadonlyMap<MessageId, InboxEntry>, readonly InboxItem[]>();

interface Joining {
  readonly held: ReadonlyMap<MessageId, InboxEntry>;
  readonly table: Table;
}

function itemsNewestFirst({ held, table }: Joining): readonly InboxItem[] {
  const items = itemsIn(held, table);
  const before = stableItems.get(held) ?? null;
  if (before !== null && sameAll(before, items)) {
    return before;
  }
  stableItems.set(held, items);
  return items;
}

export { itemsNewestFirst, keptOn };
