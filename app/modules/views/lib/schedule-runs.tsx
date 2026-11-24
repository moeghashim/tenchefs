import { FieldNote } from "../../design-system/index.tsx";
import type { ReactNode } from "react";
import { ScheduleRunList } from "./schedule-run-list.tsx";
import type { SchedulingSnapshot } from "../../board/index.ts";
import { refusalWords } from "./schedule-words.ts";

const TEXT = {
  checking: "Checking…",
  label: "Next runs",
  once: "Pick a date and a time to see when it posts.",
  recurring: "Type a cron expression to see its next runs.",
} as const;

interface ScheduleRunsProps {
  readonly state: SchedulingSnapshot;
}

function waitingWords(state: SchedulingSnapshot): string {
  if (state.kind === "once") {
    return TEXT.once;
  }
  return TEXT.recurring;
}

export function ScheduleRuns(props: ScheduleRunsProps): ReactNode {
  const { state } = props;
  const { preview } = state;
  if (preview.status === "shown") {
    return <ScheduleRunList label={TEXT.label} runs={preview.runs} timeZone={state.timeZone} />;
  }
  if (preview.status === "refused") {
    return <FieldNote refused>{refusalWords(preview)}</FieldNote>;
  }
  if (preview.status === "checking") {
    return <FieldNote refused={false}>{TEXT.checking}</FieldNote>;
  }
  return <FieldNote refused={false}>{waitingWords(state)}</FieldNote>;
}
