import { useCallback, useRef } from "react";
import type { DataAreaParts } from "./parts.ts";
import type { ReactNode } from "react";

const ROWS = 2;

export function LinesArea(parts: DataAreaParts): ReactNode {
  const { onEdit } = parts;
  const box = useRef<HTMLTextAreaElement>(null);
  const handleEdit = useCallback(() => {
    if (box.current !== null) {
      onEdit(box.current.value);
    }
  }, [onEdit]);
  return (
    <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      {parts.label}
      <textarea
        autoComplete="off"
        className="rounded-md border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-muted-foreground"
        name={parts.name}
        onChange={handleEdit}
        ref={box}
        rows={ROWS}
        spellCheck={false}
        value={parts.value}
      />
    </label>
  );
}
