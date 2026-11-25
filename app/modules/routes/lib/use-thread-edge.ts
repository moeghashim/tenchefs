import { useCallback, useSyncExternalStore } from "react";
import type { Layout } from "../../layout/index.ts";
import type { PanelEdgeParts } from "../../design-system/layout.tsx";
import { threadWidths } from "../../layout/index.ts";

const LABEL = "Resize the thread panel";

interface ThreadEdgeOptions {
  readonly layout: Layout;
  readonly closeHref: string;
}

function useThreadEdge({ closeHref, layout }: ThreadEdgeOptions): PanelEdgeParts {
  const { threadWidth } = useSyncExternalStore(layout.subscribe, layout.snapshot);
  const handleClose = useCallback(() => {
    globalThis.location.hash = closeHref;
  }, [closeHref]);
  return {
    label: LABEL,
    max: threadWidths.max,
    min: threadWidths.min,
    onClose: handleClose,
    onResize: layout.resizeThread,
    side: "left",
    step: threadWidths.step,
    width: threadWidth,
  };
}

export { useThreadEdge };
