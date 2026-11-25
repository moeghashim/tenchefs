import { Alert, ItemList, Muted, Skeleton } from "../../design-system/content.tsx";
import type { ChannelName, Identity } from "../../sdk/index.ts";
import type { ScheduleList, ScheduleListState, Scheduling } from "../../board/index.ts";
import type { ReactNode } from "react";
import { ScheduleListRow } from "./schedule-list-row.tsx";
import { useChannelSchedules } from "./use-board.ts";

const NONE = 0;

const TEXT = {
  empty: (channel: ChannelName) => `Nothing is scheduled in #${channel}.`,
  failed: "Couldn't load the scheduled messages.",
  label: (channel: ChannelName) => `#${channel} scheduled messages`,
} as const;

interface ScheduleListBodyProps {
  readonly channel: ChannelName;
  readonly me: Identity;
  readonly scheduleList: ScheduleList;
  readonly scheduling: Scheduling;
  readonly state: ScheduleListState;
}

export function ScheduleListBody(props: ScheduleListBodyProps): ReactNode {
  const { channel } = props;
  const listed = useChannelSchedules(channel);
  if (listed.status === "loading") {
    return <Skeleton width="long" />;
  }
  if (listed.status !== "loaded") {
    return <Alert>{TEXT.failed}</Alert>;
  }
  if (listed.schedules.length === NONE) {
    return <Muted>{TEXT.empty(channel)}</Muted>;
  }
  return (
    <ItemList label={TEXT.label(channel)}>
      {listed.schedules.map((schedule) => (
        <ScheduleListRow
          key={schedule.id}
          me={props.me}
          schedule={schedule}
          scheduleList={props.scheduleList}
          scheduling={props.scheduling}
          state={props.state}
        />
      ))}
    </ItemList>
  );
}
