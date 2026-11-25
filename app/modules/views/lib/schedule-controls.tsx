import { Button, ButtonRow } from "../../design-system/controls.tsx";
import type { ScheduleList, ScheduleListState, Scheduling } from "../../board/index.ts";
import { Alert } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { ScheduleToggle } from "./schedule-toggle.tsx";
import type { ScheduledMessage } from "../../scheduled-messages/index.ts";
import { refusalWords } from "./schedule-words.ts";
import { useCallback } from "react";

const TEXT = { delete: "Delete", edit: "Edit", failed: "Couldn't change it." } as const;

interface ScheduleControlsProps {
  readonly schedule: ScheduledMessage;
  readonly scheduleList: ScheduleList;
  readonly scheduling: Scheduling;
  readonly state: ScheduleListState;
}

function failureOf(state: ScheduleListState, schedule: ScheduledMessage): string | null {
  const { change } = state;
  if (change.status !== "failed" || change.id !== schedule.id || state.deleting !== null) {
    return null;
  }
  return `${TEXT.failed} ${refusalWords(change)}`;
}

function returnsTo(state: ScheduleListState, schedule: ScheduledMessage, control: "toggle" | "edit"): boolean {
  const { returnTo } = state;
  return returnTo !== null && returnTo.id === schedule.id && returnTo.control === control;
}

function busyOn(state: ScheduleListState, schedule: ScheduledMessage): boolean {
  return state.change.status === "changing" && state.change.id === schedule.id;
}

export function ScheduleControls(props: ScheduleControlsProps): ReactNode {
  const { schedule, scheduleList, scheduling, state } = props;
  const busy = busyOn(state, schedule);
  const failure = failureOf(state, schedule);
  const handleEdit = useCallback(() => {
    scheduleList.returnToEdit(null);
    scheduling.openEdit(schedule);
  }, [schedule, scheduleList, scheduling]);
  const handleDelete = useCallback(() => {
    scheduleList.askDelete(schedule.id);
  }, [schedule.id, scheduleList]);
  return (
    <>
      <ButtonRow>
        <ScheduleToggle
          busy={busy}
          focused={returnsTo(state, schedule, "toggle")}
          schedule={schedule}
          scheduleList={scheduleList}
        />
        {schedule.status !== "finished" && (
          <Button disabled={busy} focused={returnsTo(state, schedule, "edit")} onClick={handleEdit}>
            {TEXT.edit}
          </Button>
        )}
        <Button disabled={busy} onClick={handleDelete}>
          {TEXT.delete}
        </Button>
      </ButtonRow>
      {failure !== null && <Alert>{failure}</Alert>}
    </>
  );
}
