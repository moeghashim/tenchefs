import type { MessageMenu, Selection } from "../../unread/index.ts";
import type { ThreadClosing, ThreadMessagesState } from "../../board/index.ts";
import { ConversationBody } from "./conversation-body.tsx";
import { LinkedScroll } from "./linked-scroll.tsx";
import type { MessageId } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import type { Reply } from "./use-message-menu.ts";
import { countOf } from "./conversation-parts.ts";
import { useLinkedMessage } from "./linked-message.ts";

interface ConversationMessagesProps {
  readonly label: string;
  readonly state: ThreadMessagesState;
  readonly linked: MessageId | null;
  readonly me: string;
  readonly readPosition: number | null;
  readonly menu: MessageMenu;
  readonly closing: ThreadClosing;
  readonly selection: Selection;
  readonly reply: Reply;
}

export function ConversationMessages(props: ConversationMessagesProps): ReactNode {
  const { linked, state } = props;
  const { highlighted } = useLinkedMessage({ linked, state });
  return (
    <LinkedScroll count={countOf(state)} highlighted={highlighted} label={props.label}>
      <ConversationBody
        closing={props.closing}
        linked={linked}
        me={props.me}
        menu={props.menu}
        readPosition={props.readPosition}
        reply={props.reply}
        selection={props.selection}
        state={state}
      />
    </LinkedScroll>
  );
}
