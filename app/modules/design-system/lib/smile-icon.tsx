import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function SmileIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M5.75 9.25a2.75 2.75 0 0 0 4.5 0" />
      <path d="M6 6.25h.01M10 6.25h.01" strokeWidth="1.8" />
    </MenuIconFrame>
  );
}
