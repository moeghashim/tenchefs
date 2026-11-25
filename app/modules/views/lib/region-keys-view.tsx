import type { Keymap } from "../../keymap/index.ts";
import type { ReactNode } from "react";
import { useRegionKeys } from "./use-region-keys.ts";

interface RegionKeysProps {
  readonly keymap: Keymap;
}

export function RegionKeys(props: RegionKeysProps): ReactNode {
  useRegionKeys(props.keymap);
  return null;
}
