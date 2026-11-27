import type { MenuChoice } from "./menu-parts.ts";
import type { ReactNode } from "react";
import { useOffered } from "./use-offered.ts";

interface PanelLabelledParts {
  readonly label: string;
  readonly detail: string;
  readonly tabIndex: number;
  readonly choices: readonly MenuChoice[];
}

export function PanelLabelled(parts: PanelLabelledParts): ReactNode {
  const heading = useOffered<HTMLHeadingElement>({ choices: parts.choices });
  return (
    <div className="flex flex-1 items-baseline gap-2">
      <h2 className="rounded-sm text-sm font-semibold" ref={heading} tabIndex={parts.tabIndex}>
        {parts.label}
      </h2>
      <span className="flex-1 font-mono text-xs text-muted-foreground">{parts.detail}</span>
    </div>
  );
}
