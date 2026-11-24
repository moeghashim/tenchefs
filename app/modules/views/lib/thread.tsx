import type { ChannelName, MessageId } from "../../sdk/index.ts";
import type { Board } from "../../board/index.ts";
import type { Composer } from "./thread-draft.ts";
import type { ReactNode } from "react";
import { ReplyFooter } from "./reply-footer.tsx";
import { SidePanel } from "../../design-system/index.tsx";
import { ThreadClosingBar } from "./thread-closing-bar.tsx";
import { ThreadMessages } from "./thread-messages.tsx";
import type { Unread } from "../../unread/index.ts";
import { hrefOf } from "../../paths/index.ts";
import { threadDraft } from "./thread-draft.ts";
import { useSyncExternalStore } from "react";

const TEXT = { close: "Close panel", reply: "Reply", thread: "Thread" } as const;

interface ThreadProps {
  readonly board: Board;
  readonly channel: ChannelName;
  readonly composer: Composer;
  readonly thread: MessageId;
  readonly linked: MessageId | null;
  readonly unread: Unread;
  readonly me: string;
}

export function ThreadView(props: ThreadProps): ReactNode {
  const { channel } = props;
  const messages = props.board.thread(channel, props.thread);
  const state = useSyncExternalStore(messages.subscribe, messages.snapshot);
  const line = props.unread.newLine(channel, props.thread);
  const readPosition = useSyncExternalStore(line.subscribe, line.snapshot);
  const draft = threadDraft({ channel, composer: props.composer, me: props.me, messages, thread: props.thread });
  return (
    <SidePanel
      closeHref={hrefOf({ channel, name: "channel" })}
      closeLabel={TEXT.close}
      detail={`#${channel}`}
      label={TEXT.thread}
    >
      {state.status === "loaded" && <ThreadClosingBar closing={props.board.closing} parent={state.parent} />}
      <ThreadMessages
        closing={props.board.closing}
        linked={props.linked}
        me={props.me}
        menu={props.unread.menu}
        readPosition={readPosition}
        reply={draft.replyTo}
        state={state}
      />
      <ReplyFooter draft={draft} field={TEXT.reply} focused messages={messages} state={state} />
    </SidePanel>
  );
}
