import type { MessageId, ReadReceipt, Reply, TopLevelMessage } from "../../sdk/index.ts";
import type { MessageMenu, ThreadNews } from "../../unread/index.ts";
import { MessageStream } from "./message-stream.tsx";
import type { ReactNode } from "react";
import type { Reply as ReplyAction } from "./use-message-menu.ts";
import type { ThreadClosing } from "../../board/index.ts";

const NO_THREADS: ReadonlyMap<MessageId, ThreadNews> = new Map();

const TEXT = { earlier: "Earlier replies" } as const;

interface EarlierRepliesProps {
  readonly parent: TopLevelMessage;
  readonly replies: readonly Reply[];
  readonly receipts: readonly ReadReceipt[];
  readonly me: string;
  readonly menu: MessageMenu;
  readonly reply: ReplyAction;
  readonly closing: ThreadClosing;
  readonly deleted: ReadonlySet<MessageId>;
}

export function EarlierReplies(props: EarlierRepliesProps): ReactNode {
  return (
    <MessageStream
      after={props.parent}
      closing={props.closing}
      channel={null}
      deleted={props.deleted}
      feed={null}
      label={TEXT.earlier}
      me={props.me}
      menu={props.menu}
      messages={props.replies}
      open={null}
      opened={false}
      readPosition={null}
      receipts={props.receipts}
      reply={props.reply}
      threadParent={props.parent}
      threads={NO_THREADS}
    />
  );
}
