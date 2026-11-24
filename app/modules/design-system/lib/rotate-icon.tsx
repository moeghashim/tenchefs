import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function RotateIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <path d="M2.75 8a5.25 5.25 0 1 0 1.55-3.7" />
      <path d="M2.75 2.5v2.5h2.5" />
    </MenuIconFrame>
  );
}
