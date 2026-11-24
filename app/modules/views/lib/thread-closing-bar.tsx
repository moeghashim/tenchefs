import { ClosedBy } from "./closed-by.tsx";
import type { Closing } from "../../messages/index.ts";
import { ClosingRefusal } from "./closing-refusal.tsx";
import type { ReactNode } from "react";
import { ThreadBar } from "../../design-system/index.tsx";
import type { ThreadClosing } from "../../board/index.ts";
import type { TopLevelMessage } from "../../sdk/index.ts";
import { useCallback } from "react";

const TEXT = { close: "Close thread", reopen: "Reopen thread" } as const;

interface ThreadClosingBarProps {
  readonly closing: ThreadClosing;
  readonly parent: TopLevelMessage;
}

function closingOf(parent: TopLevelMessage): Closing | null {
  const { closedAt = null, closedBy = null } = parent;
  if (closedAt === null || closedBy === null) {
    return null;
  }
  return { closedAt, closedBy };
}

export function ThreadClosingBar(props: ThreadClosingBarProps): ReactNode {
  const { closing } = props;
  const { id } = props.parent;
  const closed = closingOf(props.parent);
  const handleClose = useCallback(() => {
    closing.close(id);
  }, [closing, id]);
  const handleReopen = useCallback(() => {
    closing.reopen(id);
  }, [closing, id]);
  return (
    <>
      {closed === null && <ThreadBar actionIcon="close" actionName={TEXT.close} onAction={handleClose} />}
      {closed !== null && (
        <ThreadBar actionIcon="reopen" actionName={TEXT.reopen} onAction={handleReopen}>
          <ClosedBy closing={closed} />
        </ThreadBar>
      )}
      <ClosingRefusal closing={closing} />
    </>
  );
}
