import type { MenuIcon } from "./menu-icons.ts";
import type { ReactNode } from "react";
import { Tooltip } from "./tooltip.tsx";
import { menuIcon } from "./menu-icons.ts";
import { useMemo } from "react";

interface ThreadBarParts {
  readonly actionIcon: MenuIcon;
  readonly actionName: string;
  readonly onAction: () => void;
  readonly children?: ReactNode;
}

export function ThreadBar(parts: ThreadBarParts): ReactNode {
  const { actionName, onAction } = parts;
  const lines = useMemo(() => [actionName], [actionName]);
  return (
    <div className="flex shrink-0 items-center gap-3 border-b bg-muted px-5 py-2 text-xs text-muted-foreground">
      <p className="flex-1">{parts.children}</p>
      <Tooltip lines={lines}>
        <button
          aria-label={actionName}
          className="rounded-md border bg-background px-2.5 py-1 text-foreground hover:bg-accent"
          onClick={onAction}
          type="button"
        >
          {menuIcon(parts.actionIcon)}
        </button>
      </Tooltip>
    </div>
  );
}
