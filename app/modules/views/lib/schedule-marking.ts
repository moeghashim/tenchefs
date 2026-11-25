import type { ChannelName } from "../../sdk/index.ts";
import type { ScheduledMessageId } from "../../scheduled-messages/index.ts";
import { createContext } from "react";

interface ScheduleMarkingOf {
  readonly open: (channel: ChannelName, id: ScheduledMessageId) => void;
}

const ScheduleMarking = createContext<ScheduleMarkingOf | null>(null);

export { ScheduleMarking, type ScheduleMarkingOf };
