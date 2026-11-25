import type { Message, MessageId, ReadReceipt, TopLevelMessage } from "../../sdk/index.ts";
import type { MessageMenu, ThreadNews } from "../../unread/index.ts";
import { CardBody } from "../../design-system/layout.tsx";
import { MessageStream } from "./message-stream.tsx";
import { Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { RepliesDivider } from "../../design-system/messages.tsx";
import type { Reply } from "./use-message-menu.ts";
import type { ThreadClosing } from "../../board/index.ts";
import { replies } from "./message-marks.ts";

const NONE = 0;
const NO_THREADS: ReadonlyMap<MessageId, ThreadNews> = new Map();

const TEXT = { empty: "No replies yet.", replies: "Replies" } as const;

interface ThreadRepliesProps {
  readonly parent: TopLevelMessage;
  readonly closing: ThreadClosing;
  readonly replies: readonly Message[];
  readonly receipts: readonly ReadReceipt[];
  readonly me: string;
  readonly readPosition: number | null;
  readonly menu: MessageMenu;
  readonly reply: Reply;
}

export function ThreadReplies(props: ThreadRepliesProps): ReactNode {
  return (
    <>
      <RepliesDivider>{replies(props.replies.length)}</RepliesDivider>
      {props.replies.length === NONE && (
        <CardBody>
          <Muted>{TEXT.empty}</Muted>
        </CardBody>
      )}
      <MessageStream
        after={props.parent}
        closing={props.closing}
        channel={null}
        label={TEXT.replies}
        me={props.me}
        menu={props.menu}
        messages={props.replies}
        open={null}
        readPosition={props.readPosition}
        receipts={props.receipts}
        reply={props.reply}
        threadParent={props.parent}
        threads={NO_THREADS}
      />
    </>
  );
}
