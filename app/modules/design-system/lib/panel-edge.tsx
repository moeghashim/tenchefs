import type { KeyboardEvent, ReactNode } from "react";
import type { PanelEdgeParts } from "./panel-edge-parts.ts";
import { useCallback } from "react";
import { useEdgeDrag } from "./use-edge-drag.ts";

interface EdgeParts {
  readonly edge: PanelEdgeParts;
}

const WIDER_KEY = { left: "ArrowLeft", right: "ArrowRight" } as const;
const NARROWER_KEY = { left: "ArrowRight", right: "ArrowLeft" } as const;
const PLACE = { left: "-left-1", right: "-right-1" } as const;

function keyedWidth(edge: PanelEdgeParts, key: string): number | null {
  if (key === WIDER_KEY[edge.side]) {
    return edge.width + edge.step;
  }
  if (key === NARROWER_KEY[edge.side]) {
    return edge.width - edge.step;
  }
  if (key === "Home") {
    return edge.min;
  }
  if (key === "End") {
    return edge.max;
  }
  return null;
}

export function PanelEdge(parts: EdgeParts): ReactNode {
  const { edge } = parts;
  const handlePointerDown = useEdgeDrag(edge);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const width = keyedWidth(edge, event.key);
      if (width !== null) {
        event.preventDefault();
        edge.onResize(width);
      }
    },
    [edge],
  );
  return (
    <div
      aria-label={edge.label}
      aria-orientation="vertical"
      aria-valuemax={edge.max}
      aria-valuemin={edge.min}
      aria-valuenow={edge.width}
      className={`absolute inset-y-0 ${PLACE[edge.side]} z-30 hidden w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-[3px] after:w-0.5 hover:after:bg-link focus-visible:after:bg-link md:block`}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      role="separator"
      tabIndex={0}
    />
  );
}
