import type { ChannelName, InboxItem, MessageId } from "../../sdk/index.ts";

type UnreadWhy = "mentioned-you" | "replied-to-you" | "reacted" | "followed-thread" | "subscribed-channel";

interface UnreadCounts {
  readonly forYou: number;
  readonly activity: number;
}

interface ThreadNews {
  readonly count: number;
  readonly forYou: number;
}

interface Reading {
  readonly item: InboxItem;
  readonly me: string;
}

interface ReadingAll {
  readonly items: readonly InboxItem[];
  readonly me: string;
}

const ONE_MORE = 1;
const NO_COUNTS: UnreadCounts = { activity: 0, forYou: 0 };
const NO_NEWS: ThreadNews = { count: 0, forYou: 0 };

function repliedWhy({ item, me }: Reading): UnreadWhy {
  if (item.message.kind === "reply" && item.parent.author.name === me) {
    return "replied-to-you";
  }
  if (item.message.kind === "reply") {
    return "followed-thread";
  }
  return "subscribed-channel";
}

function whyOf(reading: Reading): UnreadWhy {
  const { reasons } = reading.item;
  if (reasons.includes("reaction")) {
    return "reacted";
  }
  if (reasons.includes("mention")) {
    return "mentioned-you";
  }
  return repliedWhy(reading);
}

function isForYou(reading: Reading): boolean {
  const why = whyOf(reading);
  return why === "mentioned-you" || why === "replied-to-you" || why === "reacted";
}

function counted(counts: UnreadCounts, forYou: boolean): UnreadCounts {
  if (forYou) {
    return { ...counts, forYou: counts.forYou + ONE_MORE };
  }
  return { ...counts, activity: counts.activity + ONE_MORE };
}

function countsOf({ items, me }: ReadingAll): UnreadCounts {
  let counts = NO_COUNTS;
  for (const item of items) {
    counts = counted(counts, isForYou({ item, me }));
  }
  return counts;
}

function countsByChannel({ items, me }: ReadingAll): ReadonlyMap<ChannelName, UnreadCounts> {
  const counts = new Map<ChannelName, UnreadCounts>();
  for (const item of items) {
    const { name } = item.channel;
    counts.set(name, counted(counts.get(name) ?? NO_COUNTS, isForYou({ item, me })));
  }
  return counts;
}

function withReply(news: ThreadNews, forYou: boolean): ThreadNews {
  if (forYou) {
    return { count: news.count + ONE_MORE, forYou: news.forYou + ONE_MORE };
  }
  return { ...news, count: news.count + ONE_MORE };
}

function newsByThread({ items, me }: ReadingAll): ReadonlyMap<MessageId, ThreadNews> {
  const news = new Map<MessageId, ThreadNews>();
  for (const item of items) {
    if (item.message.kind === "reply" && !item.reasons.includes("reaction")) {
      const before = news.get(item.parent.id) ?? NO_NEWS;
      news.set(item.parent.id, withReply(before, isForYou({ item, me })));
    }
  }
  return news;
}

interface ChannelNews {
  readonly items: readonly InboxItem[];
  readonly channel: ChannelName;
}

function isNewsForYou(item: InboxItem): boolean {
  return item.reasons.some((reason) => reason !== "subscribed-channel");
}

function threadsWithNews({ channel, items }: ChannelNews): readonly MessageId[] {
  const threads = new Set<MessageId>();
  for (const item of items) {
    if (item.channel.name === channel && isNewsForYou(item)) {
      threads.add(item.parent.id);
    }
  }
  return [...threads].toSorted((one, other) => one - other);
}

export {
  NO_COUNTS,
  type ThreadNews,
  type UnreadCounts,
  type UnreadWhy,
  countsByChannel,
  countsOf,
  isForYou,
  newsByThread,
  threadsWithNews,
  whyOf,
};
