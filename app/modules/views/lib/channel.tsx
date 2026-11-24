import type { ChannelName, MessageId } from "../../sdk/index.ts";
import { Pane, PaneHeader } from "../../design-system/index.tsx";
import type { Board } from "../../board/index.ts";
import { ChannelFeed } from "./channel-feed.tsx";
import type { ChannelFeedProps } from "./channel-feed.tsx";
import type { Composer } from "../../composer/index.ts";
import { MessageFooter } from "./message-footer.tsx";
import { NotBuiltView } from "./not-built.tsx";
import type { ReactNode } from "react";
import { SubscriptionRefusal } from "./subscription-refusal.tsx";
import { SubscriptionToggle } from "./subscription-toggle.tsx";
import { useSyncExternalStore } from "react";

const TEXT = { missing: "No channel has this name.", nothing: "Nothing here" } as const;

interface ChannelProps {
  readonly board: Board;
  readonly channel: ChannelName;
  readonly composer: Composer;
  readonly newLine: {
    readonly subscribe: (listener: () => void) => () => void;
    readonly snapshot: () => number | null;
  };
  readonly me: string;
  readonly open: MessageId | null;
  readonly unread: ChannelFeedProps["unread"];
}

function useDescription(board: Board, name: ChannelName): string | null {
  const { channels } = useSyncExternalStore(board.subscribe, board.snapshot);
  if (channels.status !== "loaded") {
    return null;
  }
  for (const channel of channels.channels) {
    if (channel.name === name && "description" in channel) {
      return channel.description;
    }
  }
  return null;
}

export function ChannelView(props: ChannelProps): ReactNode {
  const messages = props.board.channel(props.channel);
  const state = useSyncExternalStore(messages.subscribe, messages.snapshot);
  const description = useDescription(props.board, props.channel);
  const { subscriptions } = props.board;
  const subscribed = useSyncExternalStore(subscriptions.subscribe, subscriptions.snapshot);
  const readPosition = useSyncExternalStore(props.newLine.subscribe, props.newLine.snapshot);
  if (state.status === "failed" && state.code === "channel_not_found") {
    return <NotBuiltView description={TEXT.missing} title={TEXT.nothing} />;
  }
  return (
    <Pane>
      <PaneHeader description={description} title={`#${props.channel}`}>
        {subscribed.status === "loaded" && (
          <SubscriptionToggle channel={props.channel} state={subscribed} subscriptions={subscriptions} />
        )}
      </PaneHeader>
      <SubscriptionRefusal channel={props.channel} state={subscribed} />
      <ChannelFeed
        closing={props.board.closing}
        channel={props.channel}
        me={props.me}
        messages={messages}
        open={props.open}
        state={state}
        readPosition={readPosition}
        unread={props.unread}
      />
      <MessageFooter
        commands={props.board.commands}
        channel={props.channel}
        draft={props.composer.channelDraft(props.channel)}
        messages={messages}
        scheduling={props.board.scheduling}
        state={state}
      />
    </Pane>
  );
}
