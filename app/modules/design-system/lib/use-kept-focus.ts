import { useLayoutEffect, useRef } from "react";

function nothingFocused(): boolean {
  const focused = globalThis.document.activeElement;
  return focused === null || focused === globalThis.document.body;
}

function disabledFocus(): Element | null {
  const focused = globalThis.document.activeElement;
  if (focused instanceof HTMLElement && focused.matches(":disabled")) {
    return focused;
  }
  return null;
}

function useKeptFocus(disabled: boolean): void {
  const held = useRef<Element | null>(null);
  useLayoutEffect(() => {
    if (disabled) {
      held.current = disabledFocus();
      return;
    }
    const element = held.current;
    held.current = null;
    if (element instanceof HTMLElement && nothingFocused()) {
      element.focus();
    }
  }, [disabled]);
}

export { useKeptFocus };
