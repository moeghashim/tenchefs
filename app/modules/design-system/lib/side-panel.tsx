import type { CSSProperties, ReactNode } from "react";
import { FileDrop } from "./file-drop.tsx";
import type { FilesHandler } from "./drop-zone.tsx";
import type { PanelAloneParts } from "./panel-alone-parts.ts";
import { PanelEdge } from "./panel-edge.tsx";
import type { PanelEdgeParts } from "./panel-edge-parts.ts";
import type { Parts } from "./parts.ts";
import { SidePanelHeader } from "./side-panel-header.tsx";
import type { SidePanelHeaderParts } from "./side-panel-header.tsx";
import { panelWidth } from "./panel-width.ts";

interface SidePanelParts extends Parts, SidePanelHeaderParts {
  readonly edge: PanelEdgeParts | null;
  readonly onFiles?: FilesHandler | null;
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

export function SidePanel(parts: SidePanelParts): ReactNode {
  const alone = parts.alone ?? null;
  const look = sideLook(alone, parts.edge);
  const { edge } = look;
  const handleClose = parts.onClose;
  return (
    <aside
      aria-label={parts.label}
      className={`absolute inset-0 z-20 flex w-full flex-col bg-card outline-none md:relative md:shrink-0 md:border-l ${look.width}`}
      style={look.style}
      tabIndex={-1}
    >
      {edge !== null && <PanelEdge edge={edge} />}
      <SidePanelHeader
        alone={alone}
        closeHref={parts.closeHref}
        closeLabel={parts.closeLabel}
        detail={parts.detail}
        label={parts.label}
        menu={parts.menu}
        onClose={handleClose}
      />
      <FileDrop onFiles={parts.onFiles ?? null}>{parts.children}</FileDrop>
    </aside>
  );
}
