import type { ReactNode } from "react";

interface FieldNoteParts {
  readonly children: ReactNode;
  readonly refused: boolean;
}

function noteStyle(refused: boolean): string {
  if (refused) {
    return "text-xs text-destructive";
  }
  return "text-xs text-muted-foreground";
}

export function FieldNote(parts: FieldNoteParts): ReactNode {
  return (
    <p aria-live="polite" className={noteStyle(parts.refused)}>
      {parts.children}
    </p>
  );
}
