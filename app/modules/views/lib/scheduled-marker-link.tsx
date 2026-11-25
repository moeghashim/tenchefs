import type { ChannelName } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import type { ScheduleMarkingOf } from "./schedule-marking.ts";
import { ScheduledMark } from "../../design-system/feed.tsx";
import type { ScheduledMessageId } from "../../scheduled-messages/index.ts";
import { useCallback } from "react";
import { useDeletedSchedules } from "./use-board.ts";

const TEXT = { deleted: "Schedule deleted", scheduled: "Scheduled" } as const;

interface ScheduledMarkerLinkProps {
  readonly channel: ChannelName;
  readonly id: ScheduledMessageId;
  readonly marking: ScheduleMarkingOf;
}

export function ScheduledMarkerLink(props: ScheduledMarkerLinkProps): ReactNode {
  const { channel, id, marking } = props;
  const deleted = useDeletedSchedules().has(id);
  const handleOpen = useCallback(() => {
    marking.open(channel, id);
  }, [channel, id, marking]);
  if (deleted) {
    return <ScheduledMark label={TEXT.deleted} onOpen={null} />;
  }
  return <ScheduledMark label={TEXT.scheduled} onOpen={handleOpen} />;
}
