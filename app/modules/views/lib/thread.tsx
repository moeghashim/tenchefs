import type { ChannelName, MessageId } from "../../sdk/index.ts";
import type { Board } from "../../board/index.ts";
import type { Composer } from "./thread-draft.ts";
import type { PanelEdgeParts } from "../../design-system/index.tsx";
import type { ReactNode } from "react";
import { ReplyFooter } from "./reply-footer.tsx";
import { SidePanel } from "../../design-system/index.tsx";
import { ThreadClosingBar } from "./thread-closing-bar.tsx";
import { ThreadMessages } from "./thread-messages.tsx";
import type { Unread } from "../../unread/index.ts";
import { threadDraft } from "./thread-draft.ts";
import { useSyncExternalStore } from "react";
import { useThreadHeader } from "./use-thread-header.ts";

const TEXT = { close: "Close panel", reply: "Reply", thread: "Thread" } as const;

interface ThreadProps {
  readonly board: Board;
  readonly channel: ChannelName;
  readonly composer: Composer;
  readonly edge: PanelEdgeParts;
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
  const header = useThreadHeader({ channel, closing: props.board.closing, menu: props.unread.menu, state });
  const draft = threadDraft({ channel, composer: props.composer, me: props.me, messages, thread: props.thread });
  return (
    <SidePanel
      closeHref={header.closeHref}
      closeLabel={TEXT.close}
      detail={`#${channel}`}
      edge={props.edge}
      label={TEXT.thread}
      menu={header.menu}
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
