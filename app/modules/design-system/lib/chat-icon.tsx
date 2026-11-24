import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function ChatIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z" />
    </MenuIconFrame>
  );
}
