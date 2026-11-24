import type { KeyboardEvent } from "react";

function isMenuKey(event: Pick<KeyboardEvent, "key" | "shiftKey">): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

export function openOnMenuKey(event: KeyboardEvent<HTMLElement>): void {
  if (event.defaultPrevented || !isMenuKey(event) || !(event.target instanceof Element)) {
    return;
  }
  event.preventDefault();
  const place = event.target.getBoundingClientRect();
  event.currentTarget.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: place.left, clientY: place.bottom }),
  );
}
