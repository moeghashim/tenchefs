import type { MessageId, ReadReceipt, Reply as ReplyMessage, TopLevelMessage } from "../../sdk/index.ts";
import type { MessageMenu, Selection } from "../../unread/index.ts";
import { CardBody } from "../../design-system/layout.tsx";
import { ConversationReplies } from "./conversation-replies.tsx";
import { Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { RepliesDivider } from "../../design-system/messages.tsx";
import type { Reply } from "./use-message-menu.ts";
import type { ThreadClosing } from "../../board/index.ts";
import { replies } from "./message-marks.ts";

const NONE = 0;
const KEPT = 20;

const TEXT = { empty: "No replies yet.", replies: "Replies" } as const;

interface ThreadRepliesProps {
  readonly parent: TopLevelMessage;
  readonly closing: ThreadClosing;
  readonly replies: readonly ReplyMessage[];
  readonly receipts: readonly ReadReceipt[];
  readonly me: string;
  readonly readPosition: number | null;
  readonly linked: MessageId | null;
  readonly menu: MessageMenu;
  readonly selection: Selection;
  readonly reply: Reply;
  readonly deleted: ReadonlySet<MessageId>;
}

function linkedReply({ linked, parent }: ThreadRepliesProps): MessageId | null {
  if (linked === parent.id) {
    return null;
  }
  return linked;
}

export function ThreadReplies(props: ThreadRepliesProps): ReactNode {
  const shown = props.replies.filter((message) => !props.deleted.has(message.id)).length;
  return (
    <>
      <RepliesDivider>{replies(shown)}</RepliesDivider>
      {props.replies.length === NONE && (
        <CardBody>
          <Muted>{TEXT.empty}</Muted>
        </CardBody>
      )}
      <ConversationReplies
        closing={props.closing}
        deleted={props.deleted}
        kept={KEPT}
        linked={linkedReply(props)}
        readPosition={props.readPosition}
        unlined="read"
        label={TEXT.replies}
        me={props.me}
        menu={props.menu}
        newLine={props.readPosition}
        opened={false}
        parent={props.parent}
        receipts={props.receipts}
        replies={props.replies}
        reply={props.reply}
        selection={props.selection}
      />
    </>
  );
}
