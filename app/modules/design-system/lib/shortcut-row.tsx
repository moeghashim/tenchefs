import type { ReactNode } from "react";
import type { ShortcutRowParts } from "./shortcut-list-parts.ts";

export function ShortcutRow(parts: ShortcutRowParts): ReactNode {
  return (
    <li className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="text-foreground">{parts.does}</span>
      <span className="flex shrink-0 gap-1">
        {parts.chords.map((chord) => (
          <kbd className="rounded border bg-muted px-1.5 font-mono text-xs text-muted-foreground" key={chord}>
            {chord}
          </kbd>
        ))}
      </span>
    </li>
  );
}
