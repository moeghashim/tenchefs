import { NONE } from "./unread-counts.ts";
import { Pill } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import type { UnreadCounts } from "../../unread/index.ts";

interface ChannelBadgesProps {
  readonly counts: UnreadCounts;
}

export function ChannelBadges(props: ChannelBadgesProps): ReactNode {
  const { activity, forYou } = props.counts;
  return (
    <>
      {activity > NONE && <Pill count={activity} label={`${String(activity)} unread`} tone="unseen" />}
      {forYou > NONE && <Pill count={forYou} label={`${String(forYou)} for you`} tone="loud" />}
    </>
  );
}
