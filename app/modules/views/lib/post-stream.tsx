import type { Message, MessageId, ReadReceipt, TopLevelMessage } from "../../sdk/index.ts";
import type { MessageMenu, ThreadNews } from "../../unread/index.ts";
import { MessageStream } from "./message-stream.tsx";
import type { ReactNode } from "react";
import type { Reply as ReplyAction } from "./use-message-menu.ts";

const NO_THREADS: ReadonlyMap<MessageId, ThreadNews> = new Map();
const NOTHING_DELETED: ReadonlySet<MessageId> = new Set();

interface PostStreamProps {
  readonly after: Message | null;
  readonly label: string;
  readonly messages: readonly TopLevelMessage[];
  readonly me: string;
  readonly menu: MessageMenu;
  readonly readPosition: MessageId | null;
  readonly receipts: readonly ReadReceipt[];
  readonly reply: ReplyAction;
}

export function PostStream(props: PostStreamProps): ReactNode {
  return (
    <MessageStream
      closing={null}
      deleted={NOTHING_DELETED}
      after={props.after}
      channel={null}
      feed={null}
      label={props.label}
      me={props.me}
      menu={props.menu}
      messages={props.messages}
      open={null}
      opened={false}
      readPosition={props.readPosition}
      receipts={props.receipts}
      reply={props.reply}
      threads={NO_THREADS}
      threadParent={null}
    />
  );
}
