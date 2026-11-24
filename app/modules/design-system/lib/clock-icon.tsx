import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function ClockIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3l2 1.5" />
    </MenuIconFrame>
  );
}
