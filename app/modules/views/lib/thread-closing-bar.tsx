import { useCallback, useContext } from "react";
import { ClosedBy } from "./closed-by.tsx";
import type { Closing } from "../../messages/index.ts";
import { ClosingRefusal } from "./closing-refusal.tsx";
import { LandingContext } from "../../landing/index.ts";
import type { ReactNode } from "react";
import { ThreadBar } from "../../design-system/messages.tsx";
import type { ThreadClosing } from "../../board/index.ts";
import type { TopLevelMessage } from "../../sdk/index.ts";

const TEXT = { close: "Close thread", reopen: "Reopen thread" } as const;

const SWAPPED = {
  close: `aside[aria-label="Thread"] button[aria-label="${TEXT.reopen}"]`,
  reopen: `aside[aria-label="Thread"] button[aria-label="${TEXT.close}"]`,
} as const;

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
  const { watch } = useContext(LandingContext);
  const handleClose = useCallback(() => {
    watch(SWAPPED.close);
    closing.close(id);
  }, [closing, id, watch]);
  const handleReopen = useCallback(() => {
    watch(SWAPPED.reopen);
    closing.reopen(id);
  }, [closing, id, watch]);
  return (
    <>
      {closed === null && <ThreadBar actionIcon="close" actionName={TEXT.close} onAction={handleClose} />}
      {closed !== null && (
        <ThreadBar actionIcon="reopen" actionName={TEXT.reopen} onAction={handleReopen}>
          <ClosedBy closing={closed} />
        </ThreadBar>
      )}
      <ClosingRefusal />
    </>
  );
}
