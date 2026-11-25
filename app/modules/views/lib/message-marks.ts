import type { Author, ChannelName, Message, MessageId } from "../../sdk/index.ts";
import { LinkedMessage } from "./linked-message.ts";
import type { ThreadNews } from "../../unread/index.ts";
import { hrefOf } from "../../paths/index.ts";
import { useContext } from "react";

const NONE = 0;

const REPLIES: Readonly<Record<Intl.LDMLPluralRule, string>> = {
  few: "replies",
  many: "replies",
  one: "reply",
  other: "replies",
  two: "replies",
  zero: "replies",
};
const plural = new Intl.PluralRules("en");

function replies(count: number): string {
  return `${String(count)} ${REPLIES[plural.select(count)]}`;
}

interface NewsText {
  readonly text: string;
  readonly forYou: boolean;
}

function newsText(news: ThreadNews | null): NewsText | null {
  if (news === null) {
    return null;
  }
  const text = `${String(news.count)} new ${REPLIES[plural.select(news.count)]}`;
  if (news.forYou === NONE) {
    return { forYou: false, text };
  }
  if (news.forYou === news.count) {
    return { forYou: true, text: `${text} to you` };
  }
  return { forYou: true, text: `${text} · ${String(news.forYou)} to you` };
}

interface Marking {
  readonly message: Message;
  readonly me: string;
  readonly open: MessageId | null;
  readonly parent: Message | null;
}

interface Linking {
  readonly channel: ChannelName | null;
  readonly message: Message;
}

function answersMe({ me, message, parent }: Marking): boolean {
  if (parent === null) {
    return false;
  }
  return parent.author.name === me && message.author.name !== me;
}

function markOf(marking: Marking): "for-you" | "open" | "none" {
  const { me, message, open } = marking;
  if (message.mentions.some((name) => name === me) || answersMe(marking)) {
    return "for-you";
  }
  if (message.id === open) {
    return "open";
  }
  return "none";
}

function useMarkOf(marking: Marking): "for-you" | "open" | "linked" | "none" {
  if (useContext(LinkedMessage) === marking.message.id) {
    return "linked";
  }
  return markOf(marking);
}

function threadHref({ channel, message }: Linking): string | null {
  if (channel === null || message.kind !== "top-level") {
    return null;
  }
  return hrefOf({ channel, name: "thread", thread: message.id });
}

function openThreadHref({ channel, message }: Linking): string | null {
  if (channel === null || message.kind !== "top-level") {
    return null;
  }
  return hrefOf({ channel, message: message.id, name: "thread", thread: message.id });
}

interface ThreadSummaryOf {
  readonly replyCount: number;
  readonly latestReplyAt: string;
  readonly repliers: readonly Author[];
}

function threadSummaryOf(message: Message): ThreadSummaryOf | null {
  if (message.kind !== "top-level" || message.latestReplyAt === null || message.replyCount === NONE) {
    return null;
  }
  return { latestReplyAt: message.latestReplyAt, repliers: message.repliers, replyCount: message.replyCount };
}

export {
  type NewsText,
  type ThreadSummaryOf,
  newsText,
  openThreadHref,
  replies,
  threadHref,
  threadSummaryOf,
  useMarkOf,
};
