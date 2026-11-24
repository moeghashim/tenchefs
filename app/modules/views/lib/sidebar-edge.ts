import type { Layout } from "../../layout/index.ts";
import type { PanelEdgeParts } from "../../design-system/index.tsx";
import { sidebarWidths } from "../../layout/index.ts";

const LABEL = "Resize the sidebar";

interface SidebarEdgeOptions {
  readonly layout: Layout;
  readonly width: number;
}

function sidebarEdge({ layout, width }: SidebarEdgeOptions): PanelEdgeParts {
  return {
    label: LABEL,
    max: sidebarWidths.max,
    min: sidebarWidths.min,
    onClose: null,
    onResize: layout.resizeSidebar,
    side: "right",
    step: sidebarWidths.step,
    width,
  };
}

export { sidebarEdge };
