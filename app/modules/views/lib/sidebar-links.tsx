import type { ChannelCreation, ScheduleList } from "../../board/index.ts";
import { NavHeading, NavLink, NavList } from "../../design-system/layout.tsx";
import { ChannelRows } from "./channel-rows.tsx";
import { InboxLink } from "./inbox-link.tsx";
import type { Keymap } from "../../keymap/index.ts";
import type { Looking } from "./use-unread-levels.ts";
import { NewChannel } from "./new-channel.tsx";
import { NewChannelButton } from "./new-channel-button.tsx";
import type { ReactNode } from "react";
import type { Route } from "../../paths/index.ts";
import { hrefOf } from "../../paths/index.ts";
import { useMemo } from "react";
import { useSidebarCounts } from "./use-unread-levels.ts";

const TEXT = {
  channels: "Channels",
  people: "People & agents",
  views: "Views",
} as const;

interface SidebarLinksProps {
  readonly creation: ChannelCreation;
  readonly keymap: Keymap;
  readonly route: Route;
  readonly scheduleList: ScheduleList;
  readonly unread: Looking["unread"];
  readonly me: string;
}

export type { SidebarLinksProps };

export function SidebarLinks(props: SidebarLinksProps): ReactNode {
  const { route } = props;
  const counts = useSidebarCounts({ me: props.me });
  const actions = useMemo(
    () => ({ keymap: props.keymap, scheduleList: props.scheduleList, unread: props.unread }),
    [props.keymap, props.scheduleList, props.unread],
  );
  return (
    <>
      <NavList label={TEXT.views}>
        <InboxLink active={route.name === "inbox"} counts={counts.inbox} />
        <NavLink
          active={route.name === "people" || route.name === "profile"}
          href={hrefOf({ name: "people" })}
          icon="people"
          label={TEXT.people}
          marked={false}
        />
      </NavList>
      <NavHeading label={TEXT.channels}>
        <NewChannelButton creation={props.creation} />
      </NavHeading>
      <ChannelRows actions={actions} route={route} counts={counts.channels} />
      <NewChannel creation={props.creation} keymap={props.keymap} />
    </>
  );
}
