import type { MenuClosing, Reply } from "./use-message-menu.ts";
import type { Message, ReadReceipt } from "../../sdk/index.ts";
import { useMessageMenu, useReplyAction } from "./use-message-menu.ts";
import { MessageContent } from "./message-content.tsx";
import type { MessageMenu } from "../../unread/index.ts";
import type { ReactNode } from "react";
import { StandaloneMessage } from "../../design-system/messages.tsx";
import { dayLabel } from "../../format/index.ts";
import { useAuthor } from "./use-author.ts";
import { useMarkOf } from "./message-marks.ts";
import { useMessageTime } from "./use-time-ago.ts";

const REPLY = "Reply";

interface StandaloneEntryProps {
  readonly message: Message;
  readonly me: string;
  readonly label: string;
  readonly receipts: readonly ReadReceipt[];
  readonly menu: MessageMenu;
  readonly closing: MenuClosing;
  readonly reply: Reply | null;
}

export function StandaloneEntry(props: StandaloneEntryProps): ReactNode {
  const { message } = props;
  const { agent, displayName, note, presence, profileHref } = useAuthor(message.author);
  const menu = useMessageMenu({ closing: props.closing, me: props.me, menu: props.menu, message, threadParent: null });
  const handleReply = useReplyAction({ me: props.me, message, reply: props.reply });
  return (
    <StandaloneMessage
      actionHref={null}
      actionLabel={REPLY}
      agent={agent}
      displayName={displayName}
      day={dayLabel(message.createdAt)}
      grouped={false}
      label={props.label}
      mark={useMarkOf({ me: props.me, message, open: null, parent: null })}
      menu={menu}
      name={message.author.name}
      nameHref={profileHref}
      note={note}
      presence={presence}
      onAction={handleReply}
      replyOnHover={props.reply !== null}
      threadHref={null}
      threadOnHover={false}
      time={useMessageTime({ message, parent: null, receipts: props.receipts })}
      unreadLine={false}
    >
      <MessageContent me={props.me} message={message} opened={false} />
    </StandaloneMessage>
  );
}
