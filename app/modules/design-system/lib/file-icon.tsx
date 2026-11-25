import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function FileIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <path d="M9 2H4.5A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V6Z" />
      <path d="M9 2v4h4" />
    </MenuIconFrame>
  );
}
