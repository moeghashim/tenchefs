import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function HashIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <path d="M6.5 2.5 5 13.5M11 2.5 9.5 13.5M2.5 6h11M2 10.5h11" />
    </MenuIconFrame>
  );
}
