import type { ScheduleList, Scheduling } from "../../board/index.ts";
import type { Identity } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { ScheduleListDialog } from "./schedule-list-dialog.tsx";
import { ScheduleMarking } from "./schedule-marking.ts";
import { useMemo } from "react";

interface ScheduleListsProps {
  readonly me: Identity;
  readonly scheduleList: ScheduleList;
  readonly scheduling: Scheduling;
  readonly children: ReactNode;
}

export function ScheduleLists(props: ScheduleListsProps): ReactNode {
  const { scheduleList } = props;
  const marking = useMemo(() => ({ open: scheduleList.open }), [scheduleList]);
  return (
    <ScheduleMarking value={marking}>
      {props.children}
      <ScheduleListDialog me={props.me} scheduleList={scheduleList} scheduling={props.scheduling} />
    </ScheduleMarking>
  );
}
