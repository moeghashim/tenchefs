import { Button } from "../../design-system/controls.tsx";
import { Notice } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import type { Reader } from "../../unread/index.ts";
import { useSyncExternalStore } from "react";

const TEXT = { marked: "Marked as read", undo: "Undo" } as const;

interface ReadNoteProps {
  readonly reader: Reader;
}

export function ReadNote(props: ReadNoteProps): ReactNode {
  const { reader } = props;
  const { marked } = useSyncExternalStore(reader.subscribe, reader.snapshot);
  const handleUndo = reader.markUnread;
  if (!marked) {
    return null;
  }
  return (
    <Notice>
      <span>{TEXT.marked}</span>
      <Button onClick={handleUndo}>{TEXT.undo}</Button>
    </Notice>
  );
}
