import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function CheckCircleIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <circle cx="8" cy="8" r="5.5" />
      <path d="m5.75 8.25 1.5 1.5 3-3.25" />
    </MenuIconFrame>
  );
}
