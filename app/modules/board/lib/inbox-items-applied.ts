import type { Applying, EarlierHeld, InboxEntries, InboxEntry } from "./inbox-entries.ts";
import type {
  ChannelName,
  InboxHistoryItem,
  InboxItem,
  Message,
  MovedBackReadPosition,
  ReadPosition,
} from "../../sdk/index.ts";
import { entryOf, same, withoutWhere } from "./inbox-entries.ts";
import { isReadAtPlace, placeKey } from "./read-positions-slice.ts";
import type { ReadPositions } from "./read-positions-slice.ts";

const NONE = 0;
const NOTHING_READ = 0;

function isReaction(entry: InboxEntry): boolean {
  return entry.reasons.includes("reaction");
}

function isReadIn(positions: ReadPositions, entry: InboxEntry): boolean {
  return isReadAtPlace({ id: entry.message, place: entry.place, positions });
}

function ackedAt(position: ReadPosition, entry: InboxEntry): boolean {
  return placeKey(entry.place) === placeKey(position) && entry.message <= position.messageId;
}

interface Reading {
  readonly entries: InboxEntries;
  readonly positions: ReadPositions;
  readonly acked: readonly ReadPosition[];
}

function isReadBy({ acked, positions }: Omit<Reading, "entries">, entry: InboxEntry): boolean {
  if (isReaction(entry)) {
    return acked.some((position) => ackedAt(position, entry));
  }
  return isReadIn(positions, entry);
}

function withRead(reading: Reading): InboxEntries {
  const { entries } = reading;
  const read = [...entries.items.values()].filter((entry) => isReadBy(reading, entry));
  if (read.length === NONE) {
    return entries;
  }
  const items = new Map(entries.items);
  const earlier = new Map(entries.earlier.read);
  for (const entry of read) {
    items.delete(entry.message);
    earlier.set(entry.message, entry);
  }
  return { ...entries, earlier: { ...entries.earlier, read: earlier }, items };
}

interface Adding {
  readonly entries: InboxEntries;
  readonly positions: ReadPositions;
  readonly items: readonly InboxItem[];
}

function withItems({ entries, items, positions }: Adding): InboxEntries {
  const fresh = items
    .map((item) => entryOf(item))
    .filter(
      (entry) =>
        (isReaction(entry) || !isReadIn(positions, entry)) &&
        !same({ one: entries.items.get(entry.message), other: entry }),
    );
  if (fresh.length === NONE) {
    return entries;
  }
  const next = new Map(entries.items);
  for (const entry of fresh) {
    next.set(entry.message, entry);
  }
  return { ...entries, items: next };
}

function isAfter(position: MovedBackReadPosition, entry: InboxEntry): boolean {
  return placeKey(entry.place) === placeKey(position) && entry.message > (position.messageId ?? NOTHING_READ);
}

function withEarlier(entries: InboxEntries, earlier: EarlierHeld): InboxEntries {
  if (earlier === entries.earlier) {
    return entries;
  }
  return { ...entries, earlier };
}

function earlierWithout(earlier: EarlierHeld, gone: (entry: InboxEntry) => boolean): EarlierHeld {
  const read = withoutWhere({ gone, held: earlier.read });
  if (read === earlier.read) {
    return earlier;
  }
  return { ...earlier, read };
}

function withoutChannel(entries: InboxEntries, channel: ChannelName): InboxEntries {
  function inChannel(entry: InboxEntry): boolean {
    return entry.place.channel === channel;
  }
  const items = withoutWhere({ gone: inChannel, held: entries.items });
  const earlier = earlierWithout(entries.earlier, inChannel);
  if (items === entries.items && earlier === entries.earlier) {
    return entries;
  }
  return { ...entries, earlier, items };
}

function withoutDeleted(entries: InboxEntries, deleted: Message): InboxEntries {
  function gone(entry: InboxEntry): boolean {
    return entry.message === deleted.id || (deleted.kind === "top-level" && entry.parent === deleted.id);
  }
  const items = withoutWhere({ gone, held: entries.items });
  const earlier = earlierWithout(entries.earlier, gone);
  if (items === entries.items && earlier === entries.earlier) {
    return entries;
  }
  return { ...entries, earlier, items };
}

interface Paging {
  readonly entries: InboxEntries;
  readonly page: readonly InboxHistoryItem[];
}

function isReadInHistory(entries: InboxEntries, item: InboxHistoryItem): boolean {
  return item.read && !entries.items.has(item.message.id);
}

function earlierWithPage(paging: Paging): EarlierHeld {
  const { earlier } = paging.entries;
  const read = new Map(earlier.read);
  for (const item of paging.page) {
    if (isReadInHistory(paging.entries, item)) {
      read.set(item.message.id, entryOf(item));
    }
  }
  return { ...earlier, read };
}

function earlierApplied({ change, entries }: Applying): InboxEntries {
  if (change.type === "earlier-more") {
    return withEarlier(entries, { ...entries.earlier, more: change.more });
  }
  if (change.type === "earlier-page") {
    const { hasMore, oldest } = change;
    return withEarlier(entries, { ...earlierWithPage({ entries, page: change.items }), hasMore, oldest });
  }
  if (change.type === "read-position-moved-back") {
    const { readPosition } = change;
    return withEarlier(
      entries,
      earlierWithout(entries.earlier, (item) => isAfter(readPosition, item)),
    );
  }
  return entries;
}

function readApplied({ change, entries, positions }: Applying): InboxEntries {
  if (change.type === "read-position") {
    return withRead({ acked: [change.readPosition], entries, positions });
  }
  if (change.type === "positions-read" || change.type === "inbox-acked-all") {
    return withRead({ acked: [], entries, positions });
  }
  return entries;
}

function itemsApplied(applying: Applying): InboxEntries {
  const { change, entries, positions } = applying;
  if (change.type === "inbox-item") {
    return withItems({ entries, items: [change.item], positions });
  }
  if (change.type === "inbox-read-again") {
    return withItems({ entries, items: change.items, positions });
  }
  if (change.type === "channel-deleted") {
    return withoutChannel(entries, change.channel.name);
  }
  if (change.type === "message-deleted") {
    return withoutDeleted(entries, change.message);
  }
  return readApplied(applying);
}

export { earlierApplied, earlierWithPage, itemsApplied, withItems, withRead };
