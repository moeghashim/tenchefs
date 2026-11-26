import { Alert, Skeleton } from "../../design-system/content.tsx";
import type { MessageMenu, Selection } from "../../unread/index.ts";
import type { ThreadClosing, ThreadMessagesState } from "../../board/index.ts";
import { CardBody } from "../../design-system/layout.tsx";
import type { MessageId } from "../../sdk/index.ts";
import { ParentEntry } from "./parent-entry.tsx";
import type { ReactNode } from "react";
import type { Reply } from "./use-message-menu.ts";
import { THREAD_PANEL } from "./thread-panel.ts";
import { ThreadReplies } from "./thread-replies.tsx";

const TEXT = { parent: THREAD_PANEL.parent } as const;

interface ThreadBodyProps {
  readonly state: ThreadMessagesState;
  readonly me: string;
  readonly readPosition: number | null;
  readonly linked: MessageId | null;
  readonly menu: MessageMenu;
  readonly selection: Selection;
  readonly closing: ThreadClosing;
  readonly reply: Reply;
}

export function ThreadBody(props: ThreadBodyProps): ReactNode {
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
        label={TEXT.parent}
        me={props.me}
        menu={props.menu}
        message={state.parent}
        receipts={state.receipts}
        reply={props.reply}
      />
      <ThreadReplies
        closing={props.closing}
        deleted={state.deleted}
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
      {state.read.status === "failed" && (
        <Alert>{`Couldn't mark the thread read (${state.read.code}): ${state.read.message}`}</Alert>
      )}
    </>
  );
}
