import { useCallback, useMemo, useRef } from "react";
import type { MouseEvent } from "react";

const SECONDARY = 2;
const FIRST = 0;

interface SelectionMenu {
  readonly onMouseDownCapture: (event: MouseEvent<HTMLElement>) => void;
  readonly onContextMenuCapture: (event: MouseEvent<HTMLElement>) => void;
}

function selectedIn(event: MouseEvent<HTMLElement>): boolean {
  const selection = globalThis.getSelection();
  if (selection === null || selection.isCollapsed) {
    return false;
  }
  return selection.getRangeAt(FIRST).intersectsNode(event.currentTarget);
}

export function useSelectionMenu(): SelectionMenu {
  const pressed = useRef<boolean | null>(null);
  const handleMouseDown = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.button === SECONDARY || event.ctrlKey) {
      pressed.current = selectedIn(event);
    }
  }, []);
  const handleContextMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    const selected = pressed.current ?? selectedIn(event);
    pressed.current = null;
    if (selected) {
      event.stopPropagation();
    }
  }, []);
  return useMemo(
    () => ({ onContextMenuCapture: handleContextMenu, onMouseDownCapture: handleMouseDown }),
    [handleContextMenu, handleMouseDown],
  );
}
