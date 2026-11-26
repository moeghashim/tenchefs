import type { ChannelName, MessageId } from "../../sdk/index.ts";
import type { Composer } from "./thread-draft.ts";
import type { PanelEdgeParts } from "../../design-system/layout.tsx";
import type { ReactNode } from "react";
import { SidePanel } from "../../design-system/layout.tsx";
import { ThreadContent } from "./thread-content.tsx";
import { ThreadGone } from "./thread-gone.tsx";
import type { Unread } from "../../unread/index.ts";
import { threadDraft } from "./thread-draft.ts";
import { useShownThread } from "./use-board.ts";
import { useSyncExternalStore } from "react";
import { useThreadHeader } from "./use-thread-header.ts";

const TEXT = { close: "Close panel", thread: "Thread" } as const;
const CLOSE_LINK = `aside[aria-label="${TEXT.thread}"] a[aria-label="${TEXT.close}"]`;

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
  const { channel, thread } = props;
  const { closing, read: messages, state } = useShownThread({ acking: true, place: { channel, id: thread } });
  const line = props.unread.newLine(channel, thread);
  const readPosition = useSyncExternalStore(line.subscribe, line.snapshot);
  const header = useThreadHeader({ alone: props.alone, channel, closing, menu: props.unread.menu, state, thread });
  const handleClose = header.onClose;
  const draft = threadDraft({ channel, composer: props.composer, me: props.me, messages, thread });
  const handleFiles = draft.attachments.attach;
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
      onFiles={handleFiles}
    >
      {header.gone && <ThreadGone landing={CLOSE_LINK} />}
      {!header.gone && (
        <ThreadContent
          channel={channel}
          closing={closing}
          draft={draft}
          linked={props.linked}
          me={props.me}
          readPosition={readPosition}
          state={state}
          thread={thread}
          unread={props.unread}
        />
      )}
    </SidePanel>
  );
}
