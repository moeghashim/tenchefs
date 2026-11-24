import type { CSSProperties } from "react";
import type { PanelEdgeParts } from "./panel-edge-parts.ts";

interface PanelLook {
  readonly edge: PanelEdgeParts | null;
  readonly fixed: string;
}

interface PanelWidth {
  readonly width: string;
  readonly style: CSSProperties;
}

const NO_STYLE: CSSProperties = {};

function panelWidth(look: PanelLook): PanelWidth {
  if (look.edge === null) {
    return { style: NO_STYLE, width: look.fixed };
  }
  const style: Readonly<Record<string, string>> = { "--panel-width": `${String(look.edge.width)}px` };
  return { style, width: "md:w-(--panel-width) md:max-w-[60%]" };
}

export { panelWidth };
