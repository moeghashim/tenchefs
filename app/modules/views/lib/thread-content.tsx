import type { ChannelName, MessageId } from "../../sdk/index.ts";
import type { Scheduling, ThreadClosing, ThreadMessagesState } from "../../board/index.ts";
import type { Draft } from "../../composer/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import type { ReactNode } from "react";
import { ReplyFooter } from "./reply-footer.tsx";
import { ThreadClosingBar } from "./thread-closing-bar.tsx";
import { ThreadMessages } from "./thread-messages.tsx";
import type { Unread } from "../../unread/index.ts";

const TEXT = { reply: "Reply" } as const;

interface ThreadContentProps {
  readonly channel: ChannelName;
  readonly thread: MessageId;
  readonly closing: ThreadClosing;
  readonly draft: Draft;
  readonly keymap: Keymap;
  readonly linked: MessageId | null;
  readonly me: string;
  readonly readPosition: number | null;
  readonly scheduling: Scheduling;
  readonly state: ThreadMessagesState;
  readonly unread: Unread;
}

export function ThreadContent(props: ThreadContentProps): ReactNode {
  const { channel, closing, draft, state, thread } = props;
  return (
    <>
      {state.status === "loaded" && <ThreadClosingBar closing={closing} parent={state.parent} />}
      <ThreadMessages
        closing={closing}
        linked={props.linked}
        me={props.me}
        menu={props.unread.menu}
        readPosition={props.readPosition}
        reply={draft.replyTo}
        selection={props.unread.selection({ channel, thread })}
        state={state}
      />
      <ReplyFooter
        draft={draft}
        field={TEXT.reply}
        focused={props.linked !== thread}
        keymap={props.keymap}
        channel={channel}
        replied={null}
        scheduling={props.scheduling}
        state={state}
        thread={thread}
      />
    </>
  );
}
