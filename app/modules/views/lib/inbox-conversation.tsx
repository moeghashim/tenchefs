import type { Reading, Unread } from "../../unread/index.ts";
import { ChannelConversation } from "./channel-conversation.tsx";
import type { Composer } from "../../composer/index.ts";
import { ConversationEmpty } from "../../design-system/layout.tsx";
import { ConversationView } from "./conversation.tsx";
import type { InboxSelection } from "../../paths/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import type { PanelEdgeParts } from "../../design-system/layout.tsx";
import type { ReactNode } from "react";
import type { Scheduling } from "../../board/index.ts";

const TEXT = { conversation: "Conversation", pick: "Pick a conversation" } as const;

interface InboxConversationProps {
  readonly composer: Composer;
  readonly edge: PanelEdgeParts;
  readonly selected: InboxSelection | null;
  readonly unread: Unread;
  readonly reading: Reading;
  readonly scheduling: Scheduling;
  readonly me: string;
  readonly keymap: Keymap;
}

export function InboxConversation(props: InboxConversationProps): ReactNode {
  const { selected } = props;
  if (selected === null) {
    return <ConversationEmpty label={TEXT.conversation}>{TEXT.pick}</ConversationEmpty>;
  }
  if (selected.thread === null) {
    return (
      <ChannelConversation
        channel={selected.channel}
        composer={props.composer}
        edge={props.edge}
        key={selected.channel}
        keymap={props.keymap}
        me={props.me}
        reading={props.reading}
        scheduling={props.scheduling}
        unread={props.unread}
      />
    );
  }
  return (
    <ConversationView
      composer={props.composer}
      key={`${selected.channel}/${String(selected.thread)}`}
      edge={props.edge}
      keymap={props.keymap}
      me={props.me}
      reading={props.reading}
      scheduling={props.scheduling}
      selected={selected}
      unread={props.unread}
    />
  );
}
