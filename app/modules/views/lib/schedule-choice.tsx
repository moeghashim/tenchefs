import type { MenuChoice } from "../../design-system/messages.tsx";
import { MoreActions } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import { useMemo } from "react";

const TEXT = { label: "Post later", schedule: "Schedule…" } as const;

interface ScheduleChoiceProps {
  readonly onSchedule: () => void;
}

export function ScheduleChoice(props: ScheduleChoiceProps): ReactNode {
  const { onSchedule } = props;
  const choices = useMemo(
    (): readonly MenuChoice[] => [{ href: null, icon: "schedule", label: TEXT.schedule, onSelect: onSchedule }],
    [onSchedule],
  );
  return <MoreActions choices={choices} label={TEXT.label} look="box" />;
}
