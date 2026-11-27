import type { ChannelName, MessageId } from "../../sdk/index.ts";
import type { ComponentProps, ReactNode } from "react";
import { Pane, PaneHeader } from "../../design-system/layout.tsx";
import { useBoardStore, useChannelPage, useChannels, useSubscriptions } from "./use-board.ts";
import { ChannelFeed } from "./channel-feed.tsx";
import type { ChannelFeedProps } from "./channel-feed.tsx";
import type { Composer } from "../../composer/index.ts";
import { MessageFooter } from "./message-footer.tsx";
import { NotBuiltView } from "./not-built.tsx";
import { SubscriptionRefusal } from "./subscription-refusal.tsx";
import { SubscriptionToggle } from "./subscription-toggle.tsx";
import { useSyncExternalStore } from "react";

const TEXT = { missing: "No channel has this name.", nothing: "Nothing here" } as const;

interface ChannelProps {
  readonly scheduling: ComponentProps<typeof MessageFooter>["scheduling"];
  readonly channel: ChannelName;
  readonly composer: Composer;
  readonly keymap: ComponentProps<typeof MessageFooter>["keymap"];
  readonly newLine: {
    readonly subscribe: (listener: () => void) => () => void;
    readonly snapshot: () => number | null;
  };
  readonly me: string;
  readonly open: MessageId | null;
  readonly unread: ChannelFeedProps["unread"];
}

function useDescription(name: ChannelName): string | null {
  const channels = useChannels();
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
  const store = useBoardStore();
  const state = useChannelPage(props.channel);
  const description = useDescription(props.channel);
  const subscribed = useSubscriptions();
  const readPosition = useSyncExternalStore(props.newLine.subscribe, props.newLine.snapshot);
  const draft = props.composer.channelDraft(props.channel);
  const handleFiles = draft.attachments.attach;
  if (state.status === "failed" && state.code === "channel_not_found") {
    return <NotBuiltView description={TEXT.missing} title={TEXT.nothing} />;
  }
  return (
    <Pane onFiles={handleFiles}>
      <PaneHeader description={description} title={`#${props.channel}`}>
        {subscribed.status === "loaded" && <SubscriptionToggle channel={props.channel} state={subscribed} />}
      </PaneHeader>
      <SubscriptionRefusal channel={props.channel} state={subscribed} />
      <ChannelFeed
        closing={store.calls}
        channel={props.channel}
        composer={props.composer}
        me={props.me}
        open={props.open}
        state={state}
        readPosition={readPosition}
        unread={props.unread}
      />
      <MessageFooter
        channel={props.channel}
        draft={draft}
        keymap={props.keymap}
        scheduling={props.scheduling}
        state={state}
      />
    </Pane>
  );
}
