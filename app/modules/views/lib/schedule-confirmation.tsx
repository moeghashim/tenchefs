import type { ChannelName, MessageId } from "../../sdk/index.ts";
import { Button } from "../../design-system/controls.tsx";
import { Notice } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import type { ScheduledMessage } from "../../scheduled-messages/index.ts";
import type { Scheduling } from "../../board/index.ts";
import { runTimeIn } from "../../format/index.ts";
import { useSyncExternalStore } from "react";

const FIRST = 0;
const ONE = 1;
const TEXT = { dismiss: "Dismiss", scheduled: "Scheduled." } as const;

interface ScheduleConfirmationProps {
  readonly channel: ChannelName;
  readonly thread: MessageId | null;
  readonly scheduling: Scheduling;
}

function confirmationOf(scheduled: ScheduledMessage): string {
  const { timeZone } = scheduled;
  const next = scheduled.nextRuns
    .slice(FIRST, ONE)
    .map((iso) => `Its next run is ${runTimeIn({ iso, timeZone })} (${timeZone}).`);
  return [TEXT.scheduled, ...next].join(" ");
}

export function ScheduleConfirmation(props: ScheduleConfirmationProps): ReactNode {
  const { scheduling } = props;
  const { scheduled, thread } = useSyncExternalStore(scheduling.subscribe, scheduling.snapshot);
  const handleDismiss = scheduling.dismiss;
  if (scheduled === null || scheduled.channel !== props.channel || thread !== props.thread) {
    return null;
  }
  return (
    <Notice>
      <span>{confirmationOf(scheduled)}</span>
      <Button onClick={handleDismiss}>{TEXT.dismiss}</Button>
    </Notice>
  );
}
