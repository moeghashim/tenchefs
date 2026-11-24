import { FeedRow, FeedText } from "../../design-system/index.tsx";
import type { InboxRow, UnreadWhy } from "../../unread/index.ts";
import type { InboxItem } from "../../sdk/index.ts";
import { MentionText } from "./mention-text.tsx";
import type { ReactNode } from "react";
import { hrefOf } from "../../paths/index.ts";
import { plainTextOf } from "./markdown-plain-text.ts";
import { reactionSymbols } from "../../messages/index.ts";
import { rowKey } from "../../unread/index.ts";
import { useAuthor } from "./use-author.ts";
import { useTimeAgo } from "./use-time-ago.ts";

const ACTIONS = { reply: "replied in a thread in", "top-level": "posted in" } as const;
const CONTEXT_LENGTH = 70;
const START = 0;
const ELLIPSIS = 1;
const ONE = 1;

interface InboxRowViewProps {
  readonly row: InboxRow;
  readonly me: string;
  readonly unread: boolean;
  readonly current: boolean;
}

function linkOf(row: InboxRow): string {
  const channel = row.latest.channel.name;
  if (row.thread !== null) {
    return hrefOf({ name: "inbox", selected: { channel, thread: row.thread } });
  }
  if (row.key === rowKey({ channel, thread: null })) {
    return hrefOf({ name: "inbox", selected: { channel, thread: null } });
  }
  return hrefOf({ channel, name: "channel" });
}

function contextOf(item: InboxItem): string | null {
  if (item.message.kind !== "reply") {
    return null;
  }
  const text = plainTextOf(item.parent.text);
  if (text.length <= CONTEXT_LENGTH) {
    return text;
  }
  return `${text.slice(START, CONTEXT_LENGTH - ELLIPSIS)}…`;
}

const WHY_TEXT = {
  "followed-thread": "New reply in a thread you follow",
  "mentioned-you": "Mentioned you",
  "replied-to-you": "Replied to you",
} as const;

function reactedText({ newReactions = [] }: InboxItem): string {
  return newReactions
    .map((reaction) => `@${reaction.identity} reacted with ${reactionSymbols[reaction.reaction]}`)
    .join(", ");
}

function whyText(why: UnreadWhy, item: InboxItem): string {
  if (why === "reacted") {
    return reactedText(item);
  }
  if (why === "subscribed-channel") {
    return `New in #${item.channel.name}`;
  }
  return WHY_TEXT[why];
}

function levelOf(row: InboxRow, unread: boolean): "for-you" | "activity" | "read" {
  if (!unread) {
    return "read";
  }
  if (row.forYou) {
    return "for-you";
  }
  return "activity";
}

function countOf(row: InboxRow, unread: boolean): string | null {
  if (!unread || row.count === ONE) {
    return null;
  }
  return `${String(row.count)} new`;
}

export function InboxRowView(props: InboxRowViewProps): ReactNode {
  const { row } = props;
  const item = row.latest;
  const { message } = item;
  const { agent, displayName, note, presence, profileHref } = useAuthor(message.author);
  const time = useTimeAgo(message.createdAt);
  return (
    <FeedRow
      action={ACTIONS[message.kind]}
      agent={agent}
      displayName={displayName}
      author={message.author.name}
      authorHref={profileHref}
      channel={item.channel.name}
      closed={typeof item.parent.closedAt === "string"}
      context={contextOf(item)}
      count={countOf(row, props.unread)}
      current={props.current}
      href={linkOf(row)}
      level={levelOf(row, props.unread)}
      note={note}
      presence={presence}
      time={time}
      why={whyText(row.why, item)}
    >
      <FeedText unread={props.unread}>
        <MentionText me={props.me} message={message} />
      </FeedText>
    </FeedRow>
  );
}
