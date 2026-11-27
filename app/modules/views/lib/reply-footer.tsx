import type { ChannelName, MessageId } from "../../sdk/index.ts";
import type { Scheduling, ThreadMessagesState } from "../../board/index.ts";
import { useMemo, useSyncExternalStore } from "react";
import type { Draft } from "../../composer/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import { MessageBox } from "./message-box.tsx";
import type { ReactNode } from "react";
import { ReplySchedule } from "./reply-schedule.tsx";
import { WebhookCommandPrompt } from "./webhook-command-prompt.tsx";
import { useReplyCommand } from "./use-reply-command.ts";

const REPLY_BOX = { form: "Reply to the thread", posts: "reply" } as const;

interface ReplyFooterProps {
  readonly draft: Draft;
  readonly field: string;
  readonly focused: boolean;
  readonly channel: ChannelName;
  readonly thread: MessageId;
  readonly keymap: Keymap;
  readonly replied: (() => void) | null;
  readonly scheduling: Scheduling;
  readonly state: ThreadMessagesState;
}

export function ReplyFooter(props: ReplyFooterProps): ReactNode {
  const { channel, draft, field, scheduling, state, thread } = props;
  const { returned, webhookCommand: command } = useSyncExternalStore(draft.subscribe, draft.snapshot);
  const handlers = useReplyCommand({ ...props, form: REPLY_BOX.form });
  const handleReply = handlers.post;
  const handleSaved = handlers.saved;
  const handleBack = draft.unpickWebhookCommand;
  const text = useMemo(() => ({ ...REPLY_BOX, field }), [field]);
  if (state.status !== "loaded") {
    return null;
  }
  return (
    <>
      {command === null && (
        <MessageBox
          draft={draft}
          focused={props.focused || returned}
          onPost={handleReply}
          post={state.reply}
          text={text}
        />
      )}
      {command !== null && (
        <WebhookCommandPrompt
          call={state.call}
          callData={state.callData}
          calls={handlers.calls}
          keymap={props.keymap}
          onBack={handleBack}
          onCancel={handleBack}
          onDone={handleSaved}
          webhookCommand={command}
        />
      )}
      <ReplySchedule
        channel={channel}
        form={REPLY_BOX.form}
        onSaved={handleSaved}
        scheduling={scheduling}
        thread={thread}
      />
    </>
  );
}
