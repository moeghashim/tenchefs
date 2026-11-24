import type { ThreadMessages, ThreadMessagesState } from "../../board/index.ts";
import type { Draft } from "../../composer/index.ts";
import { MessageBox } from "./message-box.tsx";
import type { ReactNode } from "react";
import { useMemo } from "react";

const REPLY_BOX = { form: "Reply to the thread", posts: "reply" } as const;

interface ReplyFooterProps {
  readonly draft: Draft;
  readonly field: string;
  readonly focused: boolean;
  readonly messages: ThreadMessages;
  readonly state: ThreadMessagesState;
}

export function ReplyFooter(props: ReplyFooterProps): ReactNode {
  const { field, messages, state } = props;
  const handleReply = messages.reply;
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
