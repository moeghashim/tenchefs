import { Button } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import type { ScheduleList } from "../../board/index.ts";
import type { ScheduledMessage } from "../../scheduled-messages/index.ts";
import { useCallback } from "react";

const TEXT = { pause: "Pause", resume: "Resume" } as const;

function changeOf(paused: boolean): "pause" | "resume" {
  if (paused) {
    return "resume";
  }
  return "pause";
}

interface ScheduleToggleProps {
  readonly busy: boolean;
  readonly focused: boolean;
  readonly schedule: ScheduledMessage;
  readonly scheduleList: ScheduleList;
}

export function ScheduleToggle(props: ScheduleToggleProps): ReactNode {
  const { schedule, scheduleList } = props;
  const paused = schedule.status === "paused";
  const handleClick = useCallback(() => {
    scheduleList.change(schedule.id, changeOf(paused));
  }, [paused, schedule.id, scheduleList]);
  return (
    schedule.status !== "finished" && (
      <Button disabled={props.busy} focused={props.focused} onClick={handleClick}>
        {paused && TEXT.resume}
        {!paused && TEXT.pause}
      </Button>
    )
  );
}
