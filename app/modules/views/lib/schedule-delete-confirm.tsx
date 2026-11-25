import type { ScheduleList, ScheduleListState } from "../../board/index.ts";
import { ConfirmDialog } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import { refusalWords } from "./schedule-words.ts";
import { useCallback } from "react";

const TEXT = {
  body: "It stops posting, and the messages it already posted say Schedule deleted. This can't be undone.",
  confirm: "Delete",
  failed: "Couldn't delete it.",
  title: "Delete this scheduled message?",
} as const;

interface ScheduleDeleteConfirmProps {
  readonly scheduleList: ScheduleList;
  readonly state: ScheduleListState;
}

function errorOf(state: ScheduleListState): string | null {
  if (state.change.status !== "failed" || state.deleting === null) {
    return null;
  }
  return `${TEXT.failed} ${refusalWords(state.change)}`;
}

export function ScheduleDeleteConfirm(props: ScheduleDeleteConfirmProps): ReactNode {
  const { scheduleList, state } = props;
  const { deleting } = state;
  const handleCancel = scheduleList.cancelDelete;
  const handleConfirm = useCallback(() => {
    if (deleting !== null) {
      scheduleList.change(deleting, "remove");
    }
  }, [deleting, scheduleList]);
  return (
    <ConfirmDialog
      body={TEXT.body}
      confirm={TEXT.confirm}
      destructive
      error={errorOf(state)}
      onCancel={handleCancel}
      onConfirm={handleConfirm}
      open={deleting !== null}
      pending={state.change.status === "changing"}
      title={TEXT.title}
    />
  );
}
