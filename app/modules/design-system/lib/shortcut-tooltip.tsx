import type { ReactNode } from "react";
import { Tooltip } from "./tooltip.tsx";
import { useMemo } from "react";

interface ShortcutTooltipParts {
  readonly label: string;
  readonly shortcut: string;
  readonly children: ReactNode;
}

export function ShortcutTooltip(parts: ShortcutTooltipParts): ReactNode {
  const { label, shortcut } = parts;
  const lines = useMemo(() => [`${label} (${shortcut})`], [label, shortcut]);
  return <Tooltip lines={lines}>{parts.children}</Tooltip>;
}
