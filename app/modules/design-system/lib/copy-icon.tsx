import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function CopyIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <rect height="8.5" rx="1.5" width="8.5" x="5.5" y="5.5" />
      <path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2" />
    </MenuIconFrame>
  );
}
