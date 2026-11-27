import type { ChannelMessagesState } from "../../board/index.ts";
import type { Composer } from "./thread-draft.ts";
import { LinkedScroll } from "./linked-scroll.tsx";
import { MessageRows } from "./message-rows.tsx";
import type { MessageRowsProps } from "./message-rows.tsx";
import type { ReactNode } from "react";
import { useHeldThreads } from "./use-held-threads.ts";
import { useThreadReply } from "./use-thread-reply.ts";

const NONE = 0;

interface ChannelFeedProps extends Omit<MessageRowsProps, "held" | "reply"> {
  readonly composer: Composer;
}

function countOf(state: ChannelMessagesState): number {
  if (state.status !== "loaded") {
    return NONE;
  }
  return state.messages.length;
}

export function ChannelFeed(props: ChannelFeedProps): ReactNode {
  const { channel, me, state, unread } = props;
  const { held, highlighted } = useHeldThreads({ channel, me, state, unread });
  const reply = useThreadReply({ channel, composer: props.composer, me });
  return (
    <LinkedScroll count={countOf(state)} highlighted={highlighted} label={`Messages in #${channel}`}>
      <MessageRows
        channel={channel}
        closing={props.closing}
        held={held}
        me={me}
        open={props.open}
        readPosition={props.readPosition}
        reply={reply}
        state={state}
        unread={unread}
      />
    </LinkedScroll>
  );
}

export type { ChannelFeedProps };
