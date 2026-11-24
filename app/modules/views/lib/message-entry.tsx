import type { ChannelName, Message, MessageId, ReadReceipt } from "../../sdk/index.ts";
import { FeedRowClosed, MessageItem } from "../../design-system/index.tsx";
import type { MenuClosing, Reply } from "./use-message-menu.ts";
import type { MessageMenu, ThreadNews } from "../../unread/index.ts";
import { threadHref, threadSummaryOf, useMarkOf } from "./message-marks.ts";
import { useMessageMenu, useReplyAction } from "./use-message-menu.ts";
import { MessageContent } from "./message-content.tsx";
import type { ReactNode } from "react";
import { ReplySummary } from "./reply-summary.tsx";
import { useAuthor } from "./use-author.ts";
import { useMessageTime } from "./use-time-ago.ts";

const REPLY = "Reply";

interface Row {
  readonly message: Message;
  readonly day: string | null;
  readonly grouped: boolean;
  readonly unreadLine: boolean;
}

interface MessageEntryProps {
  readonly row: Row;
  readonly me: string;
  readonly channel: ChannelName | null;
  readonly closed: boolean;
  readonly open: MessageId | null;
  readonly parent: Message | null;
  readonly news: ThreadNews | null;
  readonly receipts: readonly ReadReceipt[];
  readonly menu: MessageMenu;
  readonly closing: MenuClosing;
  readonly reply: Reply | null;
}

export function MessageEntry(props: MessageEntryProps): ReactNode {
  const { message } = props.row;
  const { agent, displayName, note, presence, profileHref } = useAuthor(message.author);
  const href = threadHref({ channel: props.channel, message });
  const summary = threadSummaryOf(message);
  const menu = useMessageMenu({ closing: props.closing, me: props.me, menu: props.menu, message });
  const handleReply = useReplyAction({ me: props.me, message, reply: props.reply });
  return (
    <MessageItem
      actionHref={href}
      actionLabel={REPLY}
      agent={agent}
      displayName={displayName}
      day={props.row.day}
      grouped={props.row.grouped}
      mark={useMarkOf({ me: props.me, message, open: props.open, parent: props.parent })}
      menu={menu}
      name={message.author.name}
      nameHref={profileHref}
      note={note}
      presence={presence}
      onAction={handleReply}
      replyOnHover={message.kind === "top-level" || props.reply !== null}
      threadOnHover
      time={useMessageTime({ message, parent: props.parent, receipts: props.receipts })}
      unreadLine={props.row.unreadLine}
    >
      <MessageContent me={props.me} message={message} />
      <FeedRowClosed closed={props.closed} />
      {href !== null && summary !== null && <ReplySummary href={href} news={props.news} summary={summary} />}
    </MessageItem>
  );
}
