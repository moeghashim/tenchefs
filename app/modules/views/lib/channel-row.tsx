import type { ChannelActions } from "./use-channel-menu.ts";
import { ChannelBadges } from "./channel-badges.tsx";
import type { ChannelName } from "../../sdk/index.ts";
import { NavLink } from "../../design-system/layout.tsx";
import type { ReactNode } from "react";
import type { UnreadCounts } from "../../unread/index.ts";
import { hasUnread } from "./unread-counts.ts";
import { hrefOf } from "../../paths/index.ts";
import { memo } from "react";
import { sameProps } from "./same-props.ts";
import { useChannelMenu } from "./use-channel-menu.ts";

interface ChannelRowProps {
  readonly actions: ChannelActions;
  readonly channel: ChannelName;
  readonly open: boolean;
  readonly counts: UnreadCounts;
}

function ChannelRowView(props: ChannelRowProps): ReactNode {
  const { channel, counts } = props;
  const menu = useChannelMenu({ ...props.actions, channel, counts });
  return (
    <NavLink
      active={props.open}
      href={hrefOf({ channel, name: "channel" })}
      icon="channel"
      label={`#${channel}`}
      marked={hasUnread(counts)}
      menu={menu}
    >
      <ChannelBadges counts={counts} />
    </NavLink>
  );
}

export const ChannelRow = memo(ChannelRowView, sameProps("counts"));
