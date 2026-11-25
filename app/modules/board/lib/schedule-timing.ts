import type { ScheduleKind } from "./scheduling-previews.ts";
import type { ScheduledMessage } from "../../scheduled-messages/index.ts";
import { runPartsIn } from "../../format/index.ts";

interface Retiming {
  readonly kind: ScheduleKind;
  readonly cron: string;
  readonly date: string;
  readonly time: string;
  readonly timeZone: string;
}

function timingOf(schedule: ScheduledMessage): Retiming {
  const { timeZone } = schedule;
  const at = schedule.at ?? null;
  if (at === null) {
    return { cron: schedule.cron ?? "", date: "", kind: "recurring", time: "", timeZone };
  }
  return { ...runPartsIn({ iso: at, timeZone }), cron: "", kind: "once", timeZone };
}

export { timingOf };
