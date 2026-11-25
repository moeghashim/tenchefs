import { ChannelBadges } from "./channel-badges.tsx";
import { NavLink } from "../../design-system/layout.tsx";
import type { ReactNode } from "react";
import type { UnreadCounts } from "../../unread/index.ts";
import { hasUnread } from "./unread-counts.ts";
import { hrefOf } from "../../paths/index.ts";

const TEXT = { inbox: "Inbox" } as const;

interface InboxLinkProps {
  readonly active: boolean;
  readonly counts: UnreadCounts;
}

export function InboxLink(props: InboxLinkProps): ReactNode {
  return (
    <NavLink
      active={props.active}
      href={hrefOf({ name: "inbox", selected: null })}
      icon="inbox"
      label={TEXT.inbox}
      marked={hasUnread(props.counts)}
    >
      <ChannelBadges counts={props.counts} />
    </NavLink>
  );
}
