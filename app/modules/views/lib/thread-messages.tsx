import type { ThreadClosing, ThreadMessagesState } from "../../board/index.ts";
import { LinkedScroll } from "./linked-scroll.tsx";
import type { MessageId } from "../../sdk/index.ts";
import type { MessageMenu } from "../../unread/index.ts";
import { Notice } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import type { Reply } from "./use-message-menu.ts";
import { ThreadBody } from "./thread-body.tsx";
import { useLinkedMessage } from "./linked-message.ts";

const TEXT = { missing: "That message wasn't found in this thread.", replies: "The thread's messages" } as const;

const NONE = 0;

interface ThreadMessagesProps {
  readonly state: ThreadMessagesState;
  readonly linked: MessageId | null;
  readonly me: string;
  readonly readPosition: number | null;
  readonly menu: MessageMenu;
  readonly closing: ThreadClosing;
  readonly reply: Reply;
}

function countOf(state: ThreadMessagesState): number {
  if (state.status !== "loaded") {
    return NONE;
  }
  return state.replies.length;
}

export function ThreadMessages(props: ThreadMessagesProps): ReactNode {
  const { state } = props;
  const { highlighted, missing } = useLinkedMessage({ linked: props.linked, state });
  return (
    <>
      {missing && <Notice>{TEXT.missing}</Notice>}
      <LinkedScroll count={countOf(state)} highlighted={highlighted} label={TEXT.replies}>
        <ThreadBody
          closing={props.closing}
          me={props.me}
          menu={props.menu}
          readPosition={props.readPosition}
          reply={props.reply}
          state={state}
        />
      </LinkedScroll>
    </>
  );
}
