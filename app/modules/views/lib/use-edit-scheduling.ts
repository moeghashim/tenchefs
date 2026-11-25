import type { ScheduleList, Scheduling } from "../../board/index.ts";
import type { ScheduledMessageId } from "../../scheduled-messages/index.ts";
import { useMemo } from "react";

interface EditScheduling {
  readonly editing: ScheduledMessageId | null;
  readonly scheduleList: ScheduleList;
  readonly scheduling: Scheduling;
}

export function useEditScheduling({ editing, scheduleList, scheduling }: EditScheduling): Scheduling {
  return useMemo(
    () => ({
      ...scheduling,
      close: (): void => {
        scheduling.close();
        scheduleList.returnToEdit(editing);
      },
    }),
    [editing, scheduleList, scheduling],
  );
}
