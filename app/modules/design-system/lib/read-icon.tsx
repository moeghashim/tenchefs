import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function ReadIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <path d="m1.75 8.5 2.75 2.75 6-6.5" />
      <path d="m8 10.5.75.75 6-6.5" />
    </MenuIconFrame>
  );
}
