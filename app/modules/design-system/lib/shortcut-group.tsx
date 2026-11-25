import type { ReactNode } from "react";
import type { ShortcutGroupParts } from "./shortcut-list-parts.ts";
import { ShortcutRow } from "./shortcut-row.tsx";
import { useId } from "react";

export function ShortcutGroup(parts: ShortcutGroupParts): ReactNode {
  const heading = useId();
  return (
    <section className="grid gap-1">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase" id={heading}>
        {parts.heading}
      </h3>
      <ul aria-labelledby={heading} className="grid">
        {parts.shortcuts.map((shortcut) => (
          <ShortcutRow chords={shortcut.chords} does={shortcut.does} key={shortcut.does} />
        ))}
      </ul>
    </section>
  );
}
