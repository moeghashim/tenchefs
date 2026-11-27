import type { ScheduleList, Scheduling } from "../../board/index.ts";
import { useCallback, useSyncExternalStore } from "react";
import type { Identity } from "../../sdk/index.ts";
import { ListDialog } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import { ScheduleDeleteConfirm } from "./schedule-delete-confirm.tsx";
import { ScheduleDialog } from "./schedule-dialog.tsx";
import { ScheduleListBody } from "./schedule-list-body.tsx";
import { useEditScheduling } from "./use-edit-scheduling.ts";

const TEXT = {
  close: "Close",
  description: (channel: string) => `What posts into #${channel} on a schedule, soonest made first.`,
  title: "Scheduled messages",
} as const;

interface ScheduleListDialogProps {
  readonly me: Identity;
  readonly scheduleList: ScheduleList;
  readonly scheduling: Scheduling;
}

export function ScheduleListDialog(props: ScheduleListDialogProps): ReactNode {
  const { scheduleList, scheduling } = props;
  const state = useSyncExternalStore(scheduleList.subscribe, scheduleList.snapshot);
  const handleClose = scheduleList.close;
  const { channel } = state;
  const { editing } = useSyncExternalStore(scheduling.subscribe, scheduling.snapshot);
  const handleSaved = useCallback(() => {
    if (channel !== null) {
      scheduleList.open(channel, editing);
    }
    scheduleList.returnToEdit(editing);
  }, [channel, editing, scheduleList]);
  const editScheduling = useEditScheduling({ editing, scheduleList, scheduling });
  return (
    <ListDialog
      close={TEXT.close}
      description={TEXT.description(channel ?? "")}
      onClose={handleClose}
      open={channel !== null}
      title={TEXT.title}
    >
      {channel !== null && (
        <ScheduleListBody
          channel={channel}
          me={props.me}
          scheduleList={scheduleList}
          scheduling={scheduling}
          state={state}
        />
      )}
      {channel !== null && (
        <ScheduleDialog
          cancelled={null}
          channel={channel}
          editing
          onSaved={handleSaved}
          scheduling={editScheduling}
          thread={null}
        />
      )}
      {state.deleting !== null && (
        <ScheduleDeleteConfirm deleting={state.deleting} scheduleList={scheduleList} state={state} />
      )}
    </ListDialog>
  );
}
