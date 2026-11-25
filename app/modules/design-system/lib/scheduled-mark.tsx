import { ClockIcon } from "./clock-icon.tsx";
import type { ReactNode } from "react";

interface ScheduledMarkParts {
  readonly label: string;
  readonly onOpen: (() => void) | null;
}

const LOOK = "flex w-fit shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground";

export function ScheduledMark(parts: ScheduledMarkParts): ReactNode {
  const { onOpen } = parts;
  return (
    <>
      {onOpen !== null && (
        <button className={`${LOOK} rounded hover:text-foreground hover:underline`} onClick={onOpen} type="button">
          <ClockIcon />
          {parts.label}
        </button>
      )}
      {onOpen === null && (
        <span className={LOOK}>
          <ClockIcon />
          {parts.label}
        </span>
      )}
    </>
  );
}
