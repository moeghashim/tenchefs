import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function BellIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <path d="M4 11.5V7a4 4 0 0 1 8 0v4.5l1 1H3z" />
      <path d="M6.75 14h2.5" />
    </MenuIconFrame>
  );
}
