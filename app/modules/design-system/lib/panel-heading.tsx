import type { MenuChoice } from "./menu-parts.ts";
import { PanelTitled } from "./panel-titled.tsx";
import type { ReactNode } from "react";

const NO_CHOICES: readonly MenuChoice[] = [];

interface PanelHeadingParts {
  readonly label: string;
  readonly detail: string;
  readonly title: string | null;
}

export function PanelHeading(parts: PanelHeadingParts): ReactNode {
  if (parts.title !== null) {
    return <PanelTitled choices={NO_CHOICES} detail={parts.detail} title={parts.title} />;
  }
  return (
    <>
      <h2 className="text-sm font-semibold">{parts.label}</h2>
      <span className="flex-1 font-mono text-xs text-muted-foreground">{parts.detail}</span>
    </>
  );
}
