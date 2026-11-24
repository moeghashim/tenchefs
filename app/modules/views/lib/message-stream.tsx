import type { ChannelName, Message, MessageId, ReadReceipt } from "../../sdk/index.ts";
import type { MessageMenu, ThreadNews } from "../../unread/index.ts";
import { MessageEntry } from "./message-entry.tsx";
import { MessageList } from "../../design-system/index.tsx";
import { MessageRefusals } from "./message-refusals.tsx";
import type { ReactNode } from "react";
import type { Reply } from "./use-message-menu.ts";
import { streamRows } from "./stream-rows.ts";

interface MessageStreamProps {
  readonly label: string;
  readonly messages: readonly Message[];
  readonly me: string;
  readonly readPosition: number | null;
  readonly receipts: readonly ReadReceipt[];
  readonly after: Message | null;
  readonly channel: ChannelName | null;
  readonly open: MessageId | null;
  readonly threads: ReadonlyMap<MessageId, ThreadNews>;
  readonly menu: MessageMenu;
  readonly reply: Reply | null;
}

export function MessageStream(props: MessageStreamProps): ReactNode {
  const rows = streamRows({
    after: props.after,
    me: props.me,
    messages: props.messages,
    readPosition: props.readPosition,
  });
  return (
    <>
      <MessageList label={props.label}>
        {rows.map((row) => (
          <MessageEntry
            closing={null}
            channel={props.channel}
            closed={false}
            key={row.message.id}
            me={props.me}
            menu={props.menu}
            news={props.threads.get(row.message.id) ?? null}
            open={props.open}
            parent={props.after}
            receipts={props.receipts}
            reply={props.reply}
            row={row}
          />
        ))}
      </MessageList>
      <MessageRefusals closing={null} menu={props.menu} />
    </>
  );
}
