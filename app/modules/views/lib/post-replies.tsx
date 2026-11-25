import type { Message, MessageId, ReadReceipt, Reply } from "../../sdk/index.ts";
import type { MessageMenu, ThreadNews } from "../../unread/index.ts";
import { MessageStream } from "./message-stream.tsx";
import type { ReactNode } from "react";

const LABEL = "Replies to the post";
const NO_THREADS: ReadonlyMap<MessageId, ThreadNews> = new Map();

interface PostRepliesProps {
  readonly post: Message;
  readonly replies: readonly Reply[];
  readonly receipts: readonly ReadReceipt[];
  readonly me: string;
  readonly menu: MessageMenu;
}

export function PostReplies(props: PostRepliesProps): ReactNode {
  return (
    <MessageStream
      closing={null}
      after={props.post}
      channel={null}
      label={LABEL}
      me={props.me}
      menu={props.menu}
      messages={props.replies}
      open={null}
      readPosition={null}
      receipts={props.receipts}
      reply={null}
      threads={NO_THREADS}
      threadParent={null}
    />
  );
}
