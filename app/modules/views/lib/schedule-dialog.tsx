import { Alert, FormDialog, InputField } from "../../design-system/index.tsx";
import { useCallback, useSyncExternalStore } from "react";
import type { ChannelName } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { ScheduleRuns } from "./schedule-runs.tsx";
import { ScheduleTiming } from "./schedule-timing.tsx";
import type { Scheduling } from "../../board/index.ts";
import { refusalWords } from "./schedule-words.ts";

const TEXT = {
  busy: "Scheduling…",
  button: "Schedule",
  text: "Text",
  timeZone: "Time zone",
  timeZoneHelp: "An IANA time zone, such as Europe/London. Yours unless you change it.",
  title: "Schedule a message",
} as const;

interface ScheduleDialogProps {
  readonly channel: ChannelName;
  readonly scheduling: Scheduling;
  readonly onSaved: () => void;
}

export function ScheduleDialog(props: ScheduleDialogProps): ReactNode {
  const { onSaved, scheduling } = props;
  const state = useSyncExternalStore(scheduling.subscribe, scheduling.snapshot);
  const handleCancel = scheduling.close;
  const handleEditText = scheduling.editText;
  const handleEditTimeZone = scheduling.editTimeZone;
  const handleSubmit = useCallback(() => {
    scheduling.save(onSaved);
  }, [onSaved, scheduling]);
  return (
    <FormDialog
      busy={state.save.status === "saving"}
      busyButton={TEXT.busy}
      button={TEXT.button}
      description={`Posts as you in #${props.channel}, as a new message each time.`}
      disabled={state.preview.status !== "shown"}
      onCancel={handleCancel}
      onSubmit={handleSubmit}
      open={state.open && state.channel === props.channel}
      title={TEXT.title}
    >
      <InputField
        error={null}
        help={null}
        kind="text"
        label={TEXT.text}
        onEdit={handleEditText}
        required
        value={state.text}
      />
      <ScheduleTiming scheduling={scheduling} state={state} />
      <InputField
        error={null}
        help={TEXT.timeZoneHelp}
        kind="text"
        label={TEXT.timeZone}
        onEdit={handleEditTimeZone}
        required
        value={state.timeZone}
      />
      <ScheduleRuns state={state} />
      {state.save.status === "failed" && <Alert>{`Couldn't schedule it. ${refusalWords(state.save)}`}</Alert>}
    </FormDialog>
  );
}
