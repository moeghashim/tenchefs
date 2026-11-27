import { useContext, useEffect } from "react";
import type { Keymap } from "../../keymap/index.ts";
import { LandingContext } from "../../landing/index.ts";
import { bindImageViewerKeys } from "./image-viewer-keys.ts";
import { columnActions } from "./column-keys.ts";
import { createRegionKeys } from "./regions.ts";
import { sidebar } from "./sidebar-roving.ts";

export function useRegionKeys(keymap: Keymap): void {
  const { watch } = useContext(LandingContext);
  useEffect(() => {
    const regions = createRegionKeys();
    const { intoMessages, ...messageKeys } = columnActions({ watch });
    const { document } = globalThis;
    function remember(event: Readonly<Event>): void {
      regions.remember(event.target);
    }
    document.addEventListener("focusin", remember);
    const unbind = [
      keymap.bind({ actions: regions.actions, scope: "everywhere" }),
      keymap.bind({ actions: messageKeys, scope: "message" }),
      keymap.bind({ actions: { intoMessages }, scope: "channel row", within: sidebar }),
      keymap.bind({ actions: { toSidebar: messageKeys.toSidebar }, scope: "inbox" }),
      bindImageViewerKeys(keymap),
    ];
    return (): void => {
      document.removeEventListener("focusin", remember);
      for (const each of unbind) {
        each();
      }
    };
  }, [keymap, watch]);
}
