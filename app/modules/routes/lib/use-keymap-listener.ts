import type { Keymap } from "../../keymap/index.ts";
import { useEffect } from "react";

function useKeymapListener(keymap: Keymap): void {
  useEffect(() => keymap.listen(globalThis.document), [keymap]);
}

export { useKeymapListener };
