import type { Reading, Unread } from "../../unread/index.ts";
import type { Board } from "../../board/index.ts";
import { ChannelConversation } from "./channel-conversation.tsx";
import type { Composer } from "../../composer/index.ts";
import { ConversationEmpty } from "../../design-system/index.tsx";
import { ConversationView } from "./conversation.tsx";
import type { InboxSelection } from "../../paths/index.ts";
import type { PanelEdgeParts } from "../../design-system/index.tsx";

import type { ReactNode } from "react";

const TEXT = { conversation: "Conversation", pick: "Pick a conversation" } as const;

interface InboxConversationProps {
  readonly board: Board;
  readonly composer: Composer;
  readonly edge: PanelEdgeParts;
  readonly selected: InboxSelection | null;
  readonly unread: Unread;
  readonly reading: Reading;
  readonly me: string;
}

export function InboxConversation(props: InboxConversationProps): ReactNode {
  const { selected } = props;
  if (selected === null) {
    return <ConversationEmpty label={TEXT.conversation}>{TEXT.pick}</ConversationEmpty>;
  }
  if (selected.thread === null) {
    return (
      <ChannelConversation
        board={props.board}
        channel={selected.channel}
        composer={props.composer}
        edge={props.edge}
        key={selected.channel}
        me={props.me}
        reading={props.reading}
        unread={props.unread}
      />
    );
  }
  return (
    <ConversationView
      board={props.board}
      composer={props.composer}
      key={`${selected.channel}/${String(selected.thread)}`}
      edge={props.edge}
      me={props.me}
      reading={props.reading}
      selected={selected}
      unread={props.unread}
    />
  );
}
