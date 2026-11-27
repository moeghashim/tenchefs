import { INBOX_HREF, actionsOf, detailOf, openLinkOf, shapeOf, titleOf } from "./conversation-parts.ts";
import { ConversationGone } from "./conversation-gone.tsx";
import { ConversationMessages } from "./conversation-messages.tsx";
import { ConversationPanel } from "../../design-system/layout.tsx";
import type { ConversationProps } from "./conversation-parts.ts";
import type { ReactNode } from "react";
import { ReadNote } from "./read-note.tsx";
import { ReplyFooter } from "./reply-footer.tsx";
import { threadDraft } from "./thread-draft.ts";
import { useShownThread } from "./use-board.ts";
import { useSyncExternalStore } from "react";
import { useThreadReader } from "./use-thread-reader.ts";

const TEXT = {
  back: "Back to the inbox",
  conversation: "Conversation",
  messages: "The conversation's messages",
  open: "Open thread",
  reply: "Reply",
} as const;
const BACK_LINK = `aside[aria-label="${TEXT.conversation}"] a[aria-label="${TEXT.back}"]`;

export function ConversationView(props: ConversationProps): ReactNode {
  const { channel, thread } = props.selected;
  const line = props.unread.newLine(channel, thread);
  const readPosition = useSyncExternalStore(line.subscribe, line.snapshot);
  const { closing, read: messages, state } = useShownThread({ acking: false, place: { channel, id: thread } });
  const reader = useThreadReader(props);
  const draft = threadDraft({ channel, composer: props.composer, me: props.me, messages, thread });
  const handleFiles = draft.attachments.attach;
  if (shapeOf(state) !== "shown") {
    return <ConversationGone channel={channel} edge={props.edge} landing={BACK_LINK} state={state} />;
  }
  return (
    <ConversationPanel
      actions={actionsOf({ keymap: props.keymap, reader })}
      backHref={INBOX_HREF}
      backLabel={TEXT.back}
      detail={detailOf({ selected: props.selected, state })}
      edge={props.edge}
      label={TEXT.conversation}
      message={draft.replyTo}
      onFiles={handleFiles}
      title={titleOf({ selected: props.selected, state })}
      open={openLinkOf({ keymap: props.keymap, label: TEXT.open, to: { channel, name: "thread", thread } })}
    >
      <ReadNote reader={reader} />
      <ConversationMessages
        closing={closing}
        label={TEXT.messages}
        linked={props.selected.message ?? null}
        me={props.me}
        menu={props.unread.menu}
        readPosition={readPosition}
        reply={draft.replyTo}
        selection={props.unread.selection(props.selected)}
        state={state}
      />
      <ReplyFooter
        draft={draft}
        field={TEXT.reply}
        focused={false}
        channel={channel}
        replied={null}
        state={state}
        thread={thread}
      />
    </ConversationPanel>
  );
}
