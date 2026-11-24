import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function ReplyIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <path d="M6.5 4 3 7.5 6.5 11" />
      <path d="M3 7.5h6.5a3.5 3.5 0 0 1 3.5 3.5v1" />
    </MenuIconFrame>
  );
}
