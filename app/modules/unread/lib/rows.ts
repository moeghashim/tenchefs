import type { ChannelName, InboxItem, MessageId } from "../../sdk/index.ts";
import { isForYou, whyOf } from "./levels.ts";
import type { UnreadWhy } from "./levels.ts";

interface InboxRow {
  readonly key: string;
  readonly thread: MessageId | null;
  readonly items: readonly InboxItem[];
  readonly latest: InboxItem;
  readonly reason: InboxItem;
  readonly count: number;
  readonly forYou: boolean;
  readonly why: UnreadWhy;
}

interface Reason {
  readonly item: InboxItem;
  readonly why: UnreadWhy;
}

interface Grouping {
  readonly items: readonly InboxItem[];
  readonly me: string;
}

interface Group {
  readonly items: readonly InboxItem[];
  readonly latest: InboxItem;
}

const STRENGTH: readonly UnreadWhy[] = [
  "mentioned-you",
  "replied-to-you",
  "reacted",
  "followed-thread",
  "subscribed-channel",
];
const NO_ITEMS: readonly InboxItem[] = [];

interface RowPlace {
  readonly channel: ChannelName;
  readonly thread: MessageId | null;
}

function rowKey({ channel, thread }: RowPlace): string {
  if (thread !== null) {
    return `thread ${String(thread)}`;
  }
  return `channel ${channel}`;
}

function keyOf(item: InboxItem): string {
  if (item.reasons.includes("reaction")) {
    return `reactions ${String(item.message.id)}`;
  }
  if (item.message.kind === "reply") {
    return rowKey({ channel: item.channel.name, thread: item.parent.id });
  }
  return rowKey({ channel: item.channel.name, thread: null });
}

function threadOf(item: InboxItem): MessageId | null {
  if (item.message.kind === "reply") {
    return item.parent.id;
  }
  return null;
}

function strongest(group: Group, me: string): Reason {
  let best: Reason = { item: group.latest, why: whyOf({ item: group.latest, me }) };
  for (const item of group.items.toReversed()) {
    const why = whyOf({ item, me });
    if (STRENGTH.indexOf(why) <= STRENGTH.indexOf(best.why)) {
      best = { item, why };
    }
  }
  return best;
}

function rowOf(key: string, group: Group, me: string): InboxRow {
  const { items, latest } = group;
  const reason = strongest(group, me);
  return {
    count: items.length,
    forYou: items.some((item) => isForYou({ item, me })),
    items,
    key,
    latest,
    reason: reason.item,
    thread: threadOf(latest),
    why: reason.why,
  };
}

function rowsOf({ items, me }: Grouping): readonly InboxRow[] {
  const groups = new Map<string, Group>();
  for (const item of items.toSorted((first, second) => first.message.id - second.message.id)) {
    const key = keyOf(item);
    const before = groups.get(key) ?? { items: NO_ITEMS, latest: item };
    groups.set(key, { items: [...before.items, item], latest: item });
  }
  const rows: InboxRow[] = [];
  for (const [key, group] of groups) {
    rows.push(rowOf(key, group, me));
  }
  return rows.toSorted((first, second) => second.latest.message.id - first.latest.message.id);
}

export { type InboxRow, rowKey, rowsOf };
