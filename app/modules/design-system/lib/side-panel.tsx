import type { ActionMenuParts } from "./menu-parts.ts";
import { CloseLink } from "./close-link.tsx";
import { PanelEdge } from "./panel-edge.tsx";
import type { PanelEdgeParts } from "./panel-edge-parts.ts";
import { PanelTitle } from "./panel-title.tsx";
import type { Parts } from "./parts.ts";
import type { ReactNode } from "react";
import { panelWidth } from "./panel-width.ts";

interface SidePanelParts extends Parts {
  readonly label: string;
  readonly detail: string;
  readonly closeHref: string;
  readonly closeLabel: string;
  readonly edge: PanelEdgeParts | null;
  readonly menu?: ActionMenuParts | null;
}

export function SidePanel(parts: SidePanelParts): ReactNode {
  const { edge } = parts;
  const look = panelWidth({ edge, fixed: "md:w-md" });
  return (
    <aside
      aria-label={parts.label}
      className={`absolute inset-0 z-20 flex w-full flex-col bg-card md:relative md:shrink-0 md:border-l ${look.width}`}
      style={look.style}
    >
      {edge !== null && <PanelEdge edge={edge} />}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-5">
        <PanelTitle detail={parts.detail} label={parts.label} menu={parts.menu ?? null} />
        <CloseLink href={parts.closeHref} label={parts.closeLabel} />
      </header>
      {parts.children}
    </aside>
  );
}
