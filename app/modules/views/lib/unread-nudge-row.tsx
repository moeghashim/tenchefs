import { ButtonRow } from "../../design-system/controls.tsx";
import type { Nudge } from "../../sdk/index.ts";
import { NudgeRow } from "./nudge-row.tsx";
import type { Nudges } from "../../unread/index.ts";
import type { ReactNode } from "react";
import { RowButton } from "../../design-system/feed.tsx";
import { useCallback } from "react";

const TEXT = { close: "Close", markRead: "Mark read" } as const;

interface UnreadNudgeRowProps {
  readonly nudge: Nudge;
  readonly nudges: Pick<Nudges, "close" | "markRead">;
}

export function UnreadNudgeRow(props: UnreadNudgeRowProps): ReactNode {
  const { nudge, nudges } = props;
  const handleClose = useCallback(() => {
    nudges.close(nudge);
  }, [nudges, nudge]);
  const handleMarkRead = useCallback(() => {
    nudges.markRead(nudge.id);
  }, [nudges, nudge]);
  return (
    <NudgeRow nudge={nudge} unread>
      <ButtonRow>
        <RowButton onClick={handleClose}>{TEXT.close}</RowButton>
        <RowButton onClick={handleMarkRead}>{TEXT.markRead}</RowButton>
      </ButtonRow>
    </NudgeRow>
  );
}
