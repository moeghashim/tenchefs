import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function UnreadIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" fill="currentColor" r="2" />
    </MenuIconFrame>
  );
}
