import type { CSSProperties, ReactNode } from "react";
import type { ActionMenuParts } from "./menu-parts.ts";
import { CloseLink } from "./close-link.tsx";
import { PanelAloneLink } from "./panel-alone-link.tsx";
import type { PanelAloneParts } from "./panel-alone-parts.ts";
import { PanelEdge } from "./panel-edge.tsx";
import type { PanelEdgeParts } from "./panel-edge-parts.ts";
import { PanelTitle } from "./panel-title.tsx";
import type { Parts } from "./parts.ts";
import { panelWidth } from "./panel-width.ts";

interface SidePanelParts extends Parts {
  readonly label: string;
  readonly detail: string;
  readonly closeHref: string;
  readonly closeLabel: string;
  readonly edge: PanelEdgeParts | null;
  readonly menu?: ActionMenuParts | null;
  readonly alone?: PanelAloneParts | null;
  readonly onClose?: (() => void) | null;
}

interface SideLook {
  readonly edge: PanelEdgeParts | null;
  readonly width: string;
  readonly style: CSSProperties;
}

const FILLING: SideLook = { edge: null, style: {}, width: "md:flex-1" };

function sideLook(alone: PanelAloneParts | null, edge: PanelEdgeParts | null): SideLook {
  const fitted = { edge, ...panelWidth({ edge, fixed: "md:w-md" }) };
  if (alone === null) {
    return fitted;
  }
  if (alone.alone) {
    return FILLING;
  }
  return fitted;
}

interface AloneLinks {
  readonly before: PanelAloneParts | null;
  readonly after: PanelAloneParts | null;
}

const NO_LINKS: AloneLinks = { after: null, before: null };

function aloneLinks(alone: PanelAloneParts | null): AloneLinks {
  if (alone === null) {
    return NO_LINKS;
  }
  if (alone.alone) {
    return { after: null, before: alone };
  }
  return { after: alone, before: null };
}

export function SidePanel(parts: SidePanelParts): ReactNode {
  const alone = parts.alone ?? null;
  const look = sideLook(alone, parts.edge);
  const { edge } = look;
  const { after, before } = aloneLinks(alone);
  return (
    <aside
      aria-label={parts.label}
      className={`absolute inset-0 z-20 flex w-full flex-col bg-card md:relative md:shrink-0 md:border-l ${look.width}`}
      style={look.style}
    >
      {edge !== null && <PanelEdge edge={edge} />}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-5">
        <PanelTitle detail={parts.detail} label={parts.label} menu={parts.menu ?? null} />
        <PanelAloneLink link={before} />
        <CloseLink href={parts.closeHref} label={parts.closeLabel} onFollow={parts.onClose ?? null} />
        <PanelAloneLink link={after} />
      </header>
      {parts.children}
    </aside>
  );
}
