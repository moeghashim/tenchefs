import type { ChannelName, MessageId } from "../../sdk/index.ts";
import type { Draft } from "../../composer/index.ts";
import { MessageBox } from "./message-box.tsx";
import type { ReactNode } from "react";
import type { ThreadMessagesState } from "../../board/index.ts";
import { useMemo } from "react";
import { useReply } from "./use-board.ts";

const REPLY_BOX = { form: "Reply to the thread", posts: "reply" } as const;

interface ReplyFooterProps {
  readonly draft: Draft;
  readonly field: string;
  readonly focused: boolean;
  readonly channel: ChannelName;
  readonly thread: MessageId;
  readonly replied: (() => void) | null;
  readonly state: ThreadMessagesState;
}

export function ReplyFooter(props: ReplyFooterProps): ReactNode {
  const { channel, field, state, thread } = props;
  const handleReply = useReply({ place: { channel, id: thread }, replied: props.replied });
  const text = useMemo(() => ({ ...REPLY_BOX, field }), [field]);
  if (state.status !== "loaded") {
    return null;
  }
  return (
    <MessageBox
      draft={props.draft}
      focused={props.focused}
      onPost={handleReply}
      onSchedule={null}
      post={state.reply}
      text={text}
    />
  );
}
