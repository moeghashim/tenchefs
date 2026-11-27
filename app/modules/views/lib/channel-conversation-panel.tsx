import type { ChannelName, ReadReceipt, Reply, TopLevelMessage } from "../../sdk/index.ts";
import type { ComponentProps, ReactNode } from "react";
import { ConversationPanel, ScrollArea } from "../../design-system/layout.tsx";
import type { MessageMenu, Reader, Selection } from "../../unread/index.ts";
import type { PanelAction, PanelEdgeParts, ShortcutLinkParts } from "../../design-system/layout.tsx";
import type { Scheduling, ThreadMessagesState } from "../../board/index.ts";
import { ChannelConversationBody } from "./channel-conversation-body.tsx";
import type { Composer } from "./use-channel-reply.ts";
import { ReadNote } from "./read-note.tsx";
import { ReplyFooter } from "./reply-footer.tsx";
import { hrefOf } from "../../paths/index.ts";
import { useChannelReply } from "./use-channel-reply.ts";

const TEXT = {
  back: "Back to the inbox",
  conversation: "Conversation",
  messages: "The conversation's messages",
} as const;

interface ChannelConversationPanelProps {
  readonly composer: Composer;
  readonly selection: Selection;
  readonly channel: ChannelName;
  readonly edge: PanelEdgeParts;
  readonly first: TopLevelMessage;
  readonly newest: TopLevelMessage;
  readonly posts: readonly TopLevelMessage[];
  readonly me: string;
  readonly keymap: ComponentProps<typeof ReplyFooter>["keymap"];
  readonly menu: MessageMenu;
  readonly reader: Reader;
  readonly scheduling: Scheduling;
  readonly actions: readonly PanelAction[];
  readonly open: ShortcutLinkParts;
}

interface ThreadReplies {
  readonly replies: readonly Reply[];
  readonly receipts: readonly ReadReceipt[];
}

const NO_REPLIES: ThreadReplies = { receipts: [], replies: [] };

function repliesOf(state: ThreadMessagesState): ThreadReplies {
  if (state.status !== "loaded") {
    return NO_REPLIES;
  }
  return state;
}

export function ChannelConversationPanel(props: ChannelConversationPanelProps): ReactNode {
  const { channel, posts, reader } = props;
  const reply = useChannelReply({ ...props, replied: reader.markRead });
  const handleFiles = reply.draft.attachments.attach;
  return (
    <ConversationPanel
      actions={props.actions}
      backHref={hrefOf({ name: "inbox", selected: null })}
      backLabel={TEXT.back}
      detail={`#${channel}`}
      edge={props.edge}
      label={TEXT.conversation}
      message={reply.draft.replyTo}
      onFiles={handleFiles}
      open={props.open}
    >
      <ReadNote reader={reader} />
      <ScrollArea count={posts.length} label={TEXT.messages}>
        <ChannelConversationBody
          me={props.me}
          menu={props.menu}
          post={reply.post}
          posts={posts}
          replies={repliesOf(reply.state).replies}
          reply={reply.onReply}
          replyReceipts={repliesOf(reply.state).receipts}
          state={reply.before}
        />
      </ScrollArea>
      <ReplyFooter
        draft={reply.draft}
        field={reply.field}
        focused={false}
        keymap={props.keymap}
        channel={channel}
        replied={reply.replied}
        scheduling={props.scheduling}
        state={reply.state}
        thread={reply.post.id}
      />
    </ConversationPanel>
  );
}
