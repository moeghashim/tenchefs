import { Alert, Skeleton } from "../../design-system/content.tsx";
import type { MessageMenu, Selection } from "../../unread/index.ts";
import type { ThreadClosing, ThreadMessagesState } from "../../board/index.ts";
import { CardBody } from "../../design-system/layout.tsx";
import { ConversationReplies } from "./conversation-replies.tsx";
import type { MessageId } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import type { Reply } from "./use-message-menu.ts";
import { StandaloneEntry } from "./standalone-entry.tsx";

const TEXT = { first: "First message" } as const;

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
      <StandaloneEntry
        closing={props.closing}
        label={TEXT.first}
        me={props.me}
        menu={props.menu}
        message={state.parent}
        receipts={state.receipts}
        reply={props.reply}
      />
      <ConversationReplies
        closing={props.closing}
        linked={props.linked}
        me={props.me}
        menu={props.menu}
        parent={state.parent}
        readPosition={props.readPosition}
        receipts={state.receipts}
        replies={state.replies}
        reply={props.reply}
        selection={props.selection}
      />
    </>
  );
}
