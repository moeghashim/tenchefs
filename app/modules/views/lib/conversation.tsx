import { actionsOf, isMissing } from "./conversation-parts.ts";
import { ConversationMessages } from "./conversation-messages.tsx";
import { ConversationMissing } from "./conversation-missing.tsx";
import { ConversationPanel } from "../../design-system/index.tsx";
import type { ConversationProps } from "./conversation-parts.ts";
import type { ReactNode } from "react";
import { ReadNote } from "./read-note.tsx";
import { ReplyFooter } from "./reply-footer.tsx";
import { hrefOf } from "../../paths/index.ts";
import { threadDraft } from "./thread-draft.ts";
import { useSyncExternalStore } from "react";
import { useThreadReader } from "./use-thread-reader.ts";

const TEXT = {
  back: "Back to the inbox",
  conversation: "Conversation",
  messages: "The conversation's messages",
  open: "Open thread",
  reply: "Reply",
} as const;

export function ConversationView(props: ConversationProps): ReactNode {
  const { channel, thread } = props.selected;
  const line = props.unread.newLine(channel, thread);
  const readPosition = useSyncExternalStore(line.subscribe, line.snapshot);
  const messages = props.board.thread(channel, thread);
  const state = useSyncExternalStore(messages.subscribeWithoutAcking, messages.snapshot);
  const reader = useThreadReader(props);
  const draft = threadDraft({ channel, composer: props.composer, me: props.me, messages, thread });
  if (isMissing(state)) {
    return <ConversationMissing />;
  }
  return (
    <ConversationPanel
      actions={actionsOf(reader)}
      backHref={hrefOf({ name: "inbox", selected: null })}
      backLabel={TEXT.back}
      detail={`#${channel}`}
      edge={props.edge}
      label={TEXT.conversation}
      message={draft.replyTo}
      openHref={hrefOf({ channel, name: "thread", thread })}
      openLabel={TEXT.open}
    >
      <ReadNote reader={reader} />
      <ConversationMessages
        closing={props.board.closing}
        label={TEXT.messages}
        linked={props.selected.message ?? null}
        me={props.me}
        menu={props.unread.menu}
        readPosition={readPosition}
        reply={draft.replyTo}
        selection={props.unread.selection(props.selected)}
        state={state}
      />
      <ReplyFooter draft={draft} field={TEXT.reply} focused={false} messages={messages} state={state} />
    </ConversationPanel>
  );
}
