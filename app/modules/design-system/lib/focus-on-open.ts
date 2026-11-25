import { useEffect, useRef } from "react";
import type { RefObject } from "react";

function useFocusOnOpen<Element extends HTMLElement>(focused: boolean): RefObject<Element | null> {
  const box = useRef<Element>(null);
  useEffect(() => {
    const element = box.current;
    if (focused && element !== null) {
      element.focus();
    }
  }, [focused]);
  return box;
}

export { useFocusOnOpen };
