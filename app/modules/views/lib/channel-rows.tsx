import { Alert, Skeleton } from "../../design-system/content.tsx";
import type { ChannelActions } from "./use-channel-menu.ts";
import { ChannelList } from "./channel-list.tsx";
import { ChannelMenuRefusal } from "./channel-menu-refusal.tsx";
import type { ChannelName } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import type { Route } from "../../paths/index.ts";
import type { UnreadCounts } from "../../unread/index.ts";
import { useChannels } from "./use-board.ts";

interface ChannelRowsProps {
  readonly actions: ChannelActions;
  readonly route: Route;
  readonly counts: ReadonlyMap<ChannelName, UnreadCounts>;
}

export function ChannelRows(props: ChannelRowsProps): ReactNode {
  const channels = useChannels();
  if (channels.status === "loading") {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton width="short" />
        <Skeleton width="long" />
      </div>
    );
  }
  if (channels.status === "failed") {
    return <Alert>{`Couldn't load the channels (${channels.code}): ${channels.message}`}</Alert>;
  }
  return (
    <>
      <ChannelList actions={props.actions} channels={channels} counts={props.counts} route={props.route} />
      <ChannelMenuRefusal actions={props.actions} />
    </>
  );
}
