import { useCallback, useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import type { PanelEdgeParts } from "./panel-edge-parts.ts";

interface Spot {
  readonly clientX: number;
}

interface Drag {
  readonly abort: () => void;
}

const PRIMARY = 0;

function stopDrag(drag: Drag | null): void {
  if (drag !== null) {
    drag.abort();
  }
}

function draggedWidth(edge: PanelEdgeParts, from: number, to: Spot): number {
  if (edge.side === "right") {
    return edge.width + to.clientX - from;
  }
  return edge.width + from - to.clientX;
}

function closePast(edge: PanelEdgeParts, width: number): void {
  if (edge.onClose !== null && width < edge.min) {
    edge.onClose();
  }
}

function startDrag(edge: PanelEdgeParts, from: number): Drag {
  const drag = new AbortController();
  const { signal } = drag;
  globalThis.document.addEventListener(
    "pointermove",
    (move: Spot) => {
      edge.onResize(draggedWidth(edge, from, move));
    },
    { signal },
  );
  globalThis.document.addEventListener(
    "pointerup",
    (release: Spot) => {
      drag.abort();
      closePast(edge, draggedWidth(edge, from, release));
    },
    { signal },
  );
  return drag;
}

function useEdgeDrag(edge: PanelEdgeParts): (event: MouseEvent<HTMLDivElement>) => void {
  const drag = useRef<Drag | null>(null);
  useEffect(
    () => (): void => {
      stopDrag(drag.current);
    },
    [],
  );
  return useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button !== PRIMARY) {
        return;
      }
      event.preventDefault();
      event.currentTarget.focus();
      stopDrag(drag.current);
      drag.current = startDrag(edge, event.clientX);
    },
    [edge],
  );
}

export { useEdgeDrag };
