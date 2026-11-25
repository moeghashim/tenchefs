import type { ChannelMessagesState } from "../../board/index.ts";
import type { ChannelName } from "../../sdk/index.ts";
import { ChannelStart } from "../../design-system/messages.tsx";
import { Older } from "./older.tsx";
import type { ReactNode } from "react";
import { useBoardStore } from "./use-board.ts";
import { useCallback } from "react";

type Loaded = Extract<ChannelMessagesState, { readonly status: "loaded" }>;

const TEXT = { start: "This is the start of the channel." } as const;

interface ChannelTopProps {
  readonly channel: ChannelName;
  readonly state: Loaded;
  readonly feed: string;
}

export function ChannelTop(props: ChannelTopProps): ReactNode {
  const { channel, state } = props;
  const { channelPages } = useBoardStore();
  const handleLoad = useCallback(() => {
    channelPages.loadOlder(channel);
  }, [channel, channelPages]);
  return (
    <>
      {state.hasMore && <Older feed={props.feed} older={state.older} onLoad={handleLoad} />}
      {!state.hasMore && <ChannelStart description={TEXT.start} title={`Welcome to #${channel}`} />}
    </>
  );
}
