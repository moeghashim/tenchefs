import { INBOX_HREF, shapeOf } from "./conversation-parts.ts";
import type { ChannelName } from "../../sdk/index.ts";
import { ConversationMissing } from "./conversation-missing.tsx";
import { ConversationPanel } from "../../design-system/layout.tsx";
import type { PanelEdgeParts } from "../../design-system/layout.tsx";
import type { ReactNode } from "react";
import { ThreadGone } from "./thread-gone.tsx";
import type { ThreadMessagesState } from "../../board/index.ts";

const TEXT = { back: "Back to the inbox", conversation: "Conversation" } as const;

interface ConversationGoneProps {
  readonly channel: ChannelName;
  readonly edge: PanelEdgeParts;
  readonly landing: string;
  readonly state: ThreadMessagesState;
}

export function ConversationGone(props: ConversationGoneProps): ReactNode {
  if (shapeOf(props.state) === "missing") {
    return <ConversationMissing />;
  }
  return (
    <ConversationPanel
      backHref={INBOX_HREF}
      backLabel={TEXT.back}
      detail={`#${props.channel}`}
      edge={props.edge}
      label={TEXT.conversation}
      message={null}
      open={null}
    >
      <ThreadGone landing={props.landing} />
    </ConversationPanel>
  );
}
