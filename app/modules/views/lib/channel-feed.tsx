import type { ChannelMessagesState } from "../../board/index.ts";
import { LinkedScroll } from "./linked-scroll.tsx";
import { MessageRows } from "./message-rows.tsx";
import type { MessageRowsProps } from "./message-rows.tsx";
import type { ReactNode } from "react";
import { useHeldThreads } from "./use-held-threads.ts";

const NONE = 0;

type ChannelFeedProps = Omit<MessageRowsProps, "held">;

function countOf(state: ChannelMessagesState): number {
  if (state.status !== "loaded") {
    return NONE;
  }
  return state.messages.length;
}

export function ChannelFeed(props: ChannelFeedProps): ReactNode {
  const { channel, me, state, unread } = props;
  const { held, highlighted } = useHeldThreads({ channel, me, state, unread });
  return (
    <LinkedScroll count={countOf(state)} highlighted={highlighted} label={`Messages in #${channel}`}>
      <MessageRows
        channel={channel}
        closing={props.closing}
        held={held}
        me={me}
        open={props.open}
        readPosition={props.readPosition}
        state={state}
        unread={unread}
      />
    </LinkedScroll>
  );
}

export type { ChannelFeedProps };
