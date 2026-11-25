import type { Message } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { ScheduleMarking } from "./schedule-marking.ts";
import { ScheduledMark } from "../../design-system/feed.tsx";
import { ScheduledMarkerLink } from "./scheduled-marker-link.tsx";
import { useContext } from "react";

const TEXT = { deleted: "Schedule deleted", scheduled: "Scheduled" } as const;

interface ScheduledMarkerProps {
  readonly message: Message;
}

export function ScheduledMarker(props: ScheduledMarkerProps): ReactNode {
  const { message } = props;
  const marking = useContext(ScheduleMarking);
  const marker = message.scheduledMessage ?? null;
  if (marker === null) {
    return null;
  }
  if (marker.deleted) {
    return <ScheduledMark label={TEXT.deleted} onOpen={null} />;
  }
  if (marking === null) {
    return <ScheduledMark label={TEXT.scheduled} onOpen={null} />;
  }
  return <ScheduledMarkerLink channel={message.channel} id={marker.id} marking={marking} />;
}
