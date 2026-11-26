import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function DeleteIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.75 9.5h6.5L12 4M6.75 6.5v4.5M9.25 6.5v4.5" />
    </MenuIconFrame>
  );
}
