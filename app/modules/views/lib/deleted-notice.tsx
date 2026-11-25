import { useBoardStore, useDeletedChannelNotice } from "./use-board.ts";
import { Button } from "../../design-system/controls.tsx";
import { Notice } from "../../design-system/content.tsx";
import type { ReactNode } from "react";

const TEXT = { dismiss: "Dismiss" } as const;

export function DeletedNotice(): ReactNode {
  const notice = useDeletedChannelNotice();
  const handleDismiss = useBoardStore().dismissNotice;
  if (notice === null) {
    return null;
  }
  return (
    <Notice>
      <span>{`#${notice} was deleted, so you're back in your inbox.`}</span>
      <Button onClick={handleDismiss}>{TEXT.dismiss}</Button>
    </Notice>
  );
}
