import { ActionMenu } from "./action-menu.tsx";
import { NavAnchor } from "./nav-anchor.tsx";
import type { NavLinkParts } from "./parts.ts";
import type { ReactNode } from "react";

export function NavLink(parts: NavLinkParts): ReactNode {
  const menu = parts.menu ?? null;
  if (menu === null) {
    return (
      <li className="flex">
        <NavAnchor link={parts} />
      </li>
    );
  }
  return (
    <li className="flex">
      <ActionMenu choices={menu.choices} label={menu.label}>
        <NavAnchor link={parts} />
      </ActionMenu>
    </li>
  );
}
