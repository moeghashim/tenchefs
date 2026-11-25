import { CurrentItemRow, Muted, Tag } from "../../design-system/content.tsx";
import type { ScheduleList, ScheduleListState, Scheduling } from "../../board/index.ts";
import { mayChange, nextRunWords, stateWords, timingWords } from "./schedule-facts.ts";
import type { Identity } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { ScheduleControls } from "./schedule-controls.tsx";
import type { ScheduledMessage } from "../../scheduled-messages/index.ts";

interface ScheduleListRowProps {
  readonly me: Identity;
  readonly schedule: ScheduledMessage;
  readonly scheduleList: ScheduleList;
  readonly scheduling: Scheduling;
  readonly state: ScheduleListState;
}

export function ScheduleListRow(props: ScheduleListRowProps): ReactNode {
  const { schedule } = props;
  const shownState = stateWords(schedule);
  return (
    <CurrentItemRow current={props.state.selected === schedule.id}>
      <p className="text-sm break-words whitespace-pre-wrap">{schedule.text}</p>
      <Muted>{timingWords(schedule)}</Muted>
      <Muted>{nextRunWords(schedule)}</Muted>
      <Muted>{`Created by @${schedule.creator.name}`}</Muted>
      {shownState !== null && (
        <div>
          <Tag label={shownState} />
        </div>
      )}
      {mayChange({ me: props.me, schedule }) && (
        <ScheduleControls
          schedule={schedule}
          scheduleList={props.scheduleList}
          scheduling={props.scheduling}
          state={props.state}
        />
      )}
    </CurrentItemRow>
  );
}
