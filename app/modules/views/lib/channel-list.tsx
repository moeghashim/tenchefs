import { channelOrder, openChannel } from "./channel-order.ts";
import type { ChannelActions } from "./use-channel-menu.ts";
import type { ChannelName } from "../../sdk/index.ts";
import { ChannelRow } from "./channel-row.tsx";
import type { ChannelsState } from "../../board/index.ts";
import { NO_COUNTS } from "../../unread/index.ts";
import { NavList } from "../../design-system/layout.tsx";
import type { ReactNode } from "react";
import type { Route } from "../../paths/index.ts";
import type { UnreadCounts } from "../../unread/index.ts";

const TEXT = { channels: "Channels" } as const;

interface ChannelListProps {
  readonly actions: ChannelActions;
  readonly channels: ChannelsState;
  readonly route: Route;
  readonly counts: ReadonlyMap<ChannelName, UnreadCounts>;
}

export function ChannelList(props: ChannelListProps): ReactNode {
  const { counts } = props;
  const open = openChannel(props.route);
  return (
    <NavList label={TEXT.channels}>
      {channelOrder(props.channels).map((channel) => (
        <ChannelRow
          actions={props.actions}
          channel={channel}
          counts={counts.get(channel) ?? NO_COUNTS}
          key={channel}
          open={open === channel}
        />
      ))}
    </NavList>
  );
}
