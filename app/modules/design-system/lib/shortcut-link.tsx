import type { ReactNode } from "react";
import type { Shortcut } from "./shortcut.ts";
import { Tooltip } from "./tooltip.tsx";
import { useMemo } from "react";

interface ShortcutLinkParts {
  readonly href: string;
  readonly label: string;
  readonly shortcut: Shortcut;
}

export type { ShortcutLinkParts };

export function ShortcutLink(parts: ShortcutLinkParts): ReactNode {
  const { label, shortcut } = parts;
  const lines = useMemo(() => [`${label} (${shortcut.label})`], [label, shortcut]);
  return (
    <Tooltip lines={lines}>
      <a
        aria-keyshortcuts={shortcut.keys}
        className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        href={parts.href}
      >
        {parts.label}
      </a>
    </Tooltip>
  );
}
