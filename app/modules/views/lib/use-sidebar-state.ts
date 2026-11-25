import { useCallback, useContext, useSyncExternalStore } from "react";
import { LandingContext } from "../../landing/index.ts";
import type { Layout } from "../../layout/index.ts";
import { isNarrowWindow } from "./narrow-window.ts";

interface SidebarState {
  readonly state: ReturnType<Layout["snapshot"]>;
  readonly handleFollow: () => void;
}

function useSidebarState(layout: Layout): SidebarState {
  const state = useSyncExternalStore(layout.subscribe, layout.snapshot);
  const land = useContext(LandingContext).askOnFollow;
  const handleFollow = useCallback(() => {
    if (isNarrowWindow()) {
      land();
    }
    layout.closeSidebar();
  }, [land, layout]);
  return { handleFollow, state };
}

export { useSidebarState };
