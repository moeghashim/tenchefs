import { FeedRow, FeedText } from "../../design-system/feed.tsx";
import { contextOf, whyText } from "./inbox-row-text.ts";
import type { InboxRow } from "../../unread/index.ts";
import type { InboxRowActions } from "./use-inbox-row-menu.ts";
import { MentionText } from "./mention-text.tsx";
import type { ReactNode } from "react";
import { hrefOf } from "../../paths/index.ts";
import { rowKey } from "../../unread/index.ts";
import { useAuthor } from "./use-author.ts";
import { useInboxRowMenu } from "./use-inbox-row-menu.ts";
import { useTimeAgo } from "./use-time-ago.ts";

const ACTIONS = { reply: "replied in a thread in", "top-level": "posted in" } as const;
const ONE = 1;

interface InboxRowViewProps {
  readonly actions: InboxRowActions | null;
  readonly row: InboxRow;
  readonly me: string;
  readonly unread: boolean;
  readonly current: boolean;
}

function linkOf(row: InboxRow): string {
  const channel = row.latest.channel.name;
  if (row.thread !== null) {
    return hrefOf({ name: "inbox", selected: { channel, message: row.reason.message.id, thread: row.thread } });
  }
  if (row.key === rowKey({ channel, thread: null })) {
    return hrefOf({ name: "inbox", selected: { channel, thread: null } });
  }
  return hrefOf({ channel, name: "channel" });
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
  const menu = useInboxRowMenu({ actions: props.actions, row, unread: props.unread });
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
      menu={menu}
      note={note}
      presence={presence}
      time={time}
      why={whyText({ item, why: row.why })}
    >
      <FeedText unread={props.unread}>
        <MentionText me={props.me} message={message} />
      </FeedText>
    </FeedRow>
  );
}
