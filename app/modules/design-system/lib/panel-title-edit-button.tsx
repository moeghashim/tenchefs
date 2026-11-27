import type { PanelTitleEdit } from "./panel-titling-parts.ts";
import type { ReactNode } from "react";
import { useFocusOnOpen } from "./focus-on-open.ts";

interface PanelTitleEditButtonParts {
  readonly edit: PanelTitleEdit;
}

export function PanelTitleEditButton(parts: PanelTitleEditButtonParts): ReactNode {
  const { focused, label, onEdit: handleClick } = parts.edit;
  const button = useFocusOnOpen<HTMLButtonElement>(focused);
  return (
    <button
      className="shrink-0 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={handleClick}
      ref={button}
      type="button"
    >
      {label}
    </button>
  );
}
