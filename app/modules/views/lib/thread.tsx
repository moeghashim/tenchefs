import type { ChannelName, MessageId } from "../../sdk/index.ts";
import type { Composer } from "./thread-draft.ts";
import type { PanelEdgeParts } from "../../design-system/layout.tsx";
import type { ReactNode } from "react";
import { ReplyFooter } from "./reply-footer.tsx";
import { SidePanel } from "../../design-system/layout.tsx";
import { ThreadClosingBar } from "./thread-closing-bar.tsx";
import { ThreadMessages } from "./thread-messages.tsx";
import type { Unread } from "../../unread/index.ts";
import { threadDraft } from "./thread-draft.ts";
import { useShownThread } from "./use-board.ts";
import { useSyncExternalStore } from "react";
import { useThreadHeader } from "./use-thread-header.ts";

const TEXT = { close: "Close panel", reply: "Reply", thread: "Thread" } as const;

interface ThreadProps {
  readonly alone: boolean;
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
  const { closing, read: messages, state } = useShownThread({ acking: true, place: { channel, id: props.thread } });
  const line = props.unread.newLine(channel, props.thread);
  const readPosition = useSyncExternalStore(line.subscribe, line.snapshot);
  const header = useThreadHeader({
    alone: props.alone,
    channel,
    closing,
    menu: props.unread.menu,
    state,
    thread: props.thread,
  });
  const reading = props.linked === props.thread;
  const handleClose = header.onClose;
  const draft = threadDraft({ channel, composer: props.composer, me: props.me, messages, thread: props.thread });
  return (
    <SidePanel
      alone={header.alone}
      closeHref={header.closeHref}
      closeLabel={TEXT.close}
      detail={`#${channel}`}
      edge={props.edge}
      label={TEXT.thread}
      menu={header.menu}
      onClose={handleClose}
    >
      {state.status === "loaded" && <ThreadClosingBar closing={closing} parent={state.parent} />}
      <ThreadMessages
        closing={closing}
        linked={props.linked}
        me={props.me}
        menu={props.unread.menu}
        readPosition={readPosition}
        reply={draft.replyTo}
        state={state}
      />
      <ReplyFooter
        draft={draft}
        field={TEXT.reply}
        focused={!reading}
        channel={channel}
        replied={null}
        state={state}
        thread={props.thread}
      />
    </SidePanel>
  );
}
