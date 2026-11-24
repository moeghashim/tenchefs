import { ChoiceGroup, InputField } from "../../design-system/index.tsx";
import type { ScheduleKind, Scheduling, SchedulingSnapshot } from "../../board/index.ts";
import type { ReactNode } from "react";
import { useCallback } from "react";

const TEXT = {
  cron: "Cron expression",
  cronHelp: "Minute, hour, day of month, month and weekday, such as 0 9 * * 1-5 for 9am on weekdays.",
  date: "Date",
  kind: "Repeats",
  time: "Time",
} as const;

const KINDS = [
  { label: "Once", value: "once" },
  { label: "Recurring", value: "recurring" },
] as const;

interface ScheduleTimingProps {
  readonly scheduling: Scheduling;
  readonly state: SchedulingSnapshot;
}

function kindOf(value: string): ScheduleKind {
  if (value === "recurring") {
    return "recurring";
  }
  return "once";
}

export function ScheduleTiming(props: ScheduleTimingProps): ReactNode {
  const { scheduling, state } = props;
  const handleEditCron = scheduling.editCron;
  const handleEditDate = scheduling.editDate;
  const handleEditTime = scheduling.editTime;
  const handleChoose = useCallback(
    (value: string) => {
      scheduling.chooseKind(kindOf(value));
    },
    [scheduling],
  );
  return (
    <>
      <ChoiceGroup choices={KINDS} label={TEXT.kind} onChoose={handleChoose} value={state.kind} />
      {state.kind === "recurring" && (
        <InputField
          error={null}
          help={TEXT.cronHelp}
          kind="text"
          label={TEXT.cron}
          onEdit={handleEditCron}
          required
          value={state.cron}
        />
      )}
      {state.kind === "once" && (
        <InputField
          error={null}
          help={null}
          kind="date"
          label={TEXT.date}
          onEdit={handleEditDate}
          required
          value={state.date}
        />
      )}
      {state.kind === "once" && (
        <InputField
          error={null}
          help={null}
          kind="time"
          label={TEXT.time}
          onEdit={handleEditTime}
          required
          value={state.time}
        />
      )}
    </>
  );
}
