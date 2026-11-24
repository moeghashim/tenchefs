import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function PersonIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <circle cx="8" cy="5.5" r="2.75" />
      <path d="M2.75 14c.5-2.75 2.6-4.5 5.25-4.5s4.75 1.75 5.25 4.5" />
    </MenuIconFrame>
  );
}
