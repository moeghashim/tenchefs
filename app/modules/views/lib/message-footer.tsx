import type { ChannelMessages, ChannelMessagesState, Commands, Scheduling } from "../../board/index.ts";
import { useCallback, useSyncExternalStore } from "react";
import type { ChannelName } from "../../sdk/index.ts";
import { CommandPrompt } from "./command-prompt.tsx";
import { CommandsRefusal } from "./commands-refusal.tsx";
import type { Draft } from "../../composer/index.ts";
import { MessageBox } from "./message-box.tsx";
import type { ReactNode } from "react";
import { ScheduleConfirmation } from "./schedule-confirmation.tsx";
import { ScheduleDialog } from "./schedule-dialog.tsx";

const MESSAGE_BOX = {
  field: "Message",
  form: "Post to the channel",
  posts: "message",
} as const;

interface MessageFooterProps {
  readonly channel: ChannelName;
  readonly scheduling: Scheduling;
  readonly commands: Commands;
  readonly draft: Draft;
  readonly messages: ChannelMessages;
  readonly state: ChannelMessagesState;
}

export function MessageFooter(props: MessageFooterProps): ReactNode {
  const { draft, messages, state } = props;
  const handlePost = messages.post;
  const { command, returned } = useSyncExternalStore(draft.subscribe, draft.snapshot);
  const handleBack = draft.unpick;
  const { channel, scheduling } = props;
  const handleSaved = draft.clear;
  const handleSchedule = useCallback(() => {
    scheduling.open(channel, draft.snapshot().text);
  }, [channel, draft, scheduling]);
  if (state.status !== "loaded") {
    return null;
  }
  return (
    <>
      {command === null && (
        <MessageBox
          draft={draft}
          focused={returned}
          onPost={handlePost}
          onSchedule={handleSchedule}
          post={state.post}
          text={MESSAGE_BOX}
        />
      )}
      {command !== null && (
        <CommandPrompt
          call={state.call}
          callData={state.callData}
          command={command}
          draft={draft}
          messages={messages}
          onBack={handleBack}
        />
      )}
      <CommandsRefusal commands={props.commands} />
      <ScheduleConfirmation channel={channel} scheduling={scheduling} />
      <ScheduleDialog channel={channel} onSaved={handleSaved} scheduling={scheduling} />
    </>
  );
}
