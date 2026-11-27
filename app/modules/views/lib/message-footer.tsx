import type { ChannelMessagesState, Scheduling } from "../../board/index.ts";
import type { ComponentProps, ReactNode } from "react";
import type { ChannelName } from "../../sdk/index.ts";
import type { Draft } from "../../composer/index.ts";
import { MessageBox } from "./message-box.tsx";
import { ScheduleConfirmation } from "./schedule-confirmation.tsx";
import { ScheduleDialog } from "./schedule-dialog.tsx";
import { WebhookCommandPrompt } from "./webhook-command-prompt.tsx";
import { WebhookCommandsRefusal } from "./webhook-commands-refusal.tsx";
import { useScheduleCommand } from "./use-schedule-command.ts";
import { useSyncExternalStore } from "react";

const MESSAGE_BOX = {
  field: "Message",
  form: "Post to the channel",
  posts: "message",
} as const;

const MESSAGE_FIELD = `main form[aria-label="${MESSAGE_BOX.form}"] textarea`;

interface MessageFooterProps {
  readonly channel: ChannelName;
  readonly scheduling: Scheduling;
  readonly draft: Draft;
  readonly keymap: ComponentProps<typeof WebhookCommandPrompt>["keymap"];
  readonly state: ChannelMessagesState;
}

export function MessageFooter(props: MessageFooterProps): ReactNode {
  const { channel, draft, scheduling, state } = props;
  const { webhookCommand: command, returned } = useSyncExternalStore(draft.subscribe, draft.snapshot);
  const handleBack = draft.unpickWebhookCommand;
  const handlers = useScheduleCommand({
    channel,
    draft,
    form: MESSAGE_BOX.form,
    scheduling,
    shown: command === null && state.status === "loaded",
  });
  const handlePost = handlers.post;
  const handleSaved = handlers.saved;
  if (state.status !== "loaded") {
    return null;
  }
  return (
    <>
      {command === null && (
        <MessageBox draft={draft} focused={returned} onPost={handlePost} post={state.post} text={MESSAGE_BOX} />
      )}
      {command !== null && (
        <WebhookCommandPrompt
          call={state.call}
          callData={state.callData}
          channel={channel}
          webhookCommand={command}
          keymap={props.keymap}
          onBack={handleBack}
          onDone={handleSaved}
        />
      )}
      <WebhookCommandsRefusal />
      <ScheduleConfirmation channel={channel} scheduling={scheduling} />
      <ScheduleDialog cancelled={MESSAGE_FIELD} channel={channel} onSaved={handleSaved} scheduling={scheduling} />
    </>
  );
}
