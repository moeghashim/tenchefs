import { Alert, Skeleton } from "../../design-system/content.tsx";
import type { MessageMenu, Selection } from "../../unread/index.ts";
import type { ThreadClosing, ThreadMessagesState } from "../../board/index.ts";
import { CardBody } from "../../design-system/layout.tsx";
import { ConversationReplies } from "./conversation-replies.tsx";
import type { MessageId } from "../../sdk/index.ts";
import { ParentEntry } from "./parent-entry.tsx";
import type { ReactNode } from "react";
import type { Reply } from "./use-message-menu.ts";

const NONE = 0;

const TEXT = { first: "First message", unread: "Unread replies" } as const;

interface ConversationBodyProps {
  readonly state: ThreadMessagesState;
  readonly linked: MessageId | null;
  readonly me: string;
  readonly readPosition: number | null;
  readonly menu: MessageMenu;
  readonly closing: ThreadClosing;
  readonly selection: Selection;
  readonly reply: Reply;
}

export function ConversationBody(props: ConversationBodyProps): ReactNode {
  const { state } = props;
  if (state.status === "loading") {
    return (
      <CardBody>
        <Skeleton width="short" />
        <Skeleton width="long" />
      </CardBody>
    );
  }
  if (state.status === "failed") {
    return <Alert>{`Couldn't load the thread (${state.code}): ${state.message}`}</Alert>;
  }
  return (
    <>
      <ParentEntry
        closing={props.closing}
        deleted={state.deleted}
        label={TEXT.first}
        me={props.me}
        menu={props.menu}
        message={state.parent}
        receipts={state.receipts}
        reply={props.reply}
      />
      <ConversationReplies
        closing={props.closing}
        deleted={state.deleted}
        kept={NONE}
        linked={props.linked}
        readPosition={props.readPosition}
        unlined="shown"
        label={TEXT.unread}
        me={props.me}
        menu={props.menu}
        newLine={null}
        opened
        parent={state.parent}
        receipts={state.receipts}
        replies={state.replies}
        reply={props.reply}
        selection={props.selection}
      />
    </>
  );
}
