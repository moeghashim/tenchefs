import type { IsoTime } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { RunList } from "../../design-system/index.tsx";
import { runTimeIn } from "../../format/index.ts";
import { useMemo } from "react";

interface ScheduleRunListProps {
  readonly label: string;
  readonly runs: readonly IsoTime[];
  readonly timeZone: string;
}

export function ScheduleRunList(props: ScheduleRunListProps): ReactNode {
  const { runs, timeZone } = props;
  const shown = useMemo(() => runs.map((iso) => ({ iso, text: runTimeIn({ iso, timeZone }) })), [runs, timeZone]);
  return <RunList label={props.label} runs={shown} />;
}
