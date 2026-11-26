import type { Keymap } from "../../keymap/index.ts";
import type { Landing } from "../../landing/index.ts";
import { useEffect } from "react";

interface KeymapListening {
  readonly keymap: Keymap;
  readonly landing: Landing;
}

function useKeymapListener({ keymap, landing }: KeymapListening): void {
  useEffect(() => keymap.listen(globalThis.document, landing), [keymap, landing]);
}

export { useKeymapListener };
