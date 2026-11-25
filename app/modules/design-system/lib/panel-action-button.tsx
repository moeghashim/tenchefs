import type { ReactNode } from "react";
import type { Shortcut } from "./shortcut.ts";
import { Tooltip } from "./tooltip.tsx";
import { useMemo } from "react";

interface PanelAction {
  readonly label: string;
  readonly name?: string;
  readonly shortcut: Shortcut;
  readonly onAction: () => void;
}

interface PanelActionButtonParts {
  readonly action: PanelAction;
}

export function PanelActionButton(parts: PanelActionButtonParts): ReactNode {
  const { label, onAction: handleClick, shortcut } = parts.action;
  const lines = useMemo(() => [`${label} (${shortcut.label})`], [label, shortcut]);
  return (
    <Tooltip lines={lines}>
      <button
        aria-keyshortcuts={shortcut.keys}
        aria-label={parts.action.name}
        className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={handleClick}
        type="button"
      >
        {label}
      </button>
    </Tooltip>
  );
}

export type { PanelAction };
