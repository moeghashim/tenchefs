import type { Act, Keymap } from "../../keymap/index.ts";
import type { Layout } from "../../layout/index.ts";
import { isNarrowWindow } from "./narrow-window.ts";
import { useEffect } from "react";

const OPENER = 'header[aria-label="Top bar"] button[aria-expanded]';

interface DrawerKeys {
  readonly keymap: Keymap;
  readonly layout: Layout;
}

function focusOpener(): void {
  for (const opener of globalThis.document.querySelectorAll<HTMLElement>(OPENER)) {
    opener.focus();
  }
}

function closeDrawer(layout: Layout): Act {
  return () => {
    if (!layout.snapshot().sidebar || !isNarrowWindow()) {
      return false;
    }
    layout.closeSidebar();
    focusOpener();
    return true;
  };
}

function useDrawerKeys({ keymap, layout }: DrawerKeys): void {
  useEffect(() => keymap.bind({ actions: { closeSidebar: closeDrawer(layout) }, scope: "sidebar" }), [keymap, layout]);
}

export { useDrawerKeys };
